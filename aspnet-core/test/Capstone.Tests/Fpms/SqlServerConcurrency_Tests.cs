using Abp.UI;
using Capstone.Domain;
using Capstone.Harvests;
using Capstone.Inventory;
using Capstone.Production;
using Capstone.Production.Dto;
using Capstone.Resources;
using Capstone.Sales;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Shouldly;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Threading.Tasks;
using Xunit;

namespace Capstone.Tests.Fpms;

/// <summary>
/// DEC-133 and DEC-134 on a real SQL Server (docs/reliability.md): what the in-memory test database cannot show.
/// Each test gets its own database built by the migrations, with transactions on as in the API.
/// </summary>
public class SqlServerConcurrency_Tests : SqlServerTestBase
{
    private static DateOnly Today => FarmClock.Today(FarmClock.Resolve(FarmClock.DefaultTimeZone));

    private Guid Grade(string label) => Q(c => c.SizeGrades.IgnoreQueryFilters().Single(g => g.Label == label && g.TenantId == GetTenantId(PilotFarm)).Id);
    private Guid Buyer => Q(c => c.Buyers.IgnoreQueryFilters().First(b => b.Name.StartsWith("GenSan")).Id);

    private SaveHarvestInput NewHarvest(Guid? requestId, decimal kg = 300) => new()
    {
        BatchId = BatchId(CurrentBatch), HarvestedAt = DateTime.UtcNow.AddHours(-2), HarvestType = HarvestType.Partial, TotalKg = kg, AbwG = 9,
        GradeLines = new() { new GradeLineInput { SizeGradeId = Grade("100/120"), Kg = kg } }, ClientRequestId = requestId,
    };

    /// <summary>Runs the calls at the same moment, each on its own thread with its own unit of work, as separate requests do.</summary>
    private static async Task<List<(T Value, Exception Error)>> AtOnce<T>(int count, Func<int, Task<T>> call)
    {
        var start = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var tasks = Enumerable.Range(0, count).Select(i => Task.Run(async () =>
        {
            await start.Task;
            try
            {
                return (await call(i), (Exception)null);
            }
            catch (Exception e)
            {
                return (default(T), e);
            }
        })).ToList();
        start.SetResult();
        return (await Task.WhenAll(tasks)).ToList();
    }

    private SqlConnection Open()
    {
        var connection = new SqlConnection(ConnectionString);
        connection.Open();
        return connection;
    }

    [SqlServerFact]
    public async Task The_test_database_is_migrated_with_read_committed_snapshot_on()
    {
        await using var connection = Open();
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT is_read_committed_snapshot_on FROM sys.databases WHERE name = DB_NAME()";
        ((bool)await command.ExecuteScalarAsync()).ShouldBeTrue();
        command.CommandText = "SELECT COUNT(*) FROM __EFMigrationsHistory";
        ((int)await command.ExecuteScalarAsync()).ShouldBeGreaterThanOrEqualTo(1);
    }

    [SqlServerFact]
    public async Task A_correction_from_a_page_loaded_before_another_save_is_refused()
    {
        var harvests = Resolve<HarvestAppService>();
        var saved = await harvests.Create(NewHarvest(null));
        var loaded = await harvests.Get(saved.Id);
        loaded.RowVersion.ShouldNotBeNullOrEmpty(); // SQL Server stamps a version on every save

        var first = NewHarvest(null, 310);
        first.Id = saved.Id;
        first.RowVersion = loaded.RowVersion;
        await harvests.Update(first);

        var second = NewHarvest(null, 320); // a second person, same page version
        second.Id = saved.Id;
        second.RowVersion = loaded.RowVersion;
        var error = await Should.ThrowAsync<UserFriendlyException>(() => harvests.Update(second));
        error.Message.ShouldContain("changed by someone else");
        (await harvests.Get(saved.Id)).TotalKg.ShouldBe(310m);
    }

    [SqlServerFact]
    public async Task Two_corrections_saved_at_the_same_moment_keep_one_and_refuse_the_other()
    {
        var harvests = Resolve<HarvestAppService>();
        var saved = await harvests.Create(NewHarvest(null));
        var version = (await harvests.Get(saved.Id)).RowVersion;
        var edits = new[] { NewHarvest(null, 310), NewHarvest(null, 320) };
        foreach (var edit in edits)
        {
            edit.Id = saved.Id;
            edit.RowVersion = version;
        }

        var results = await AtOnce(2, i => harvests.Update(edits[i]));

        results.Count(r => r.Error == null).ShouldBe(1);
        var refused = results.Single(r => r.Error != null).Error;
        refused.ShouldBeOfType<UserFriendlyException>().Message.ShouldContain("changed by someone else");
        new[] { 310m, 320m }.ShouldContain((await harvests.Get(saved.Id)).TotalKg);
    }

    [SqlServerFact]
    public async Task The_same_harvest_sent_several_times_at_once_is_saved_once()
    {
        var harvests = Resolve<HarvestAppService>();
        var id = Guid.NewGuid();
        var inputs = Enumerable.Range(0, 4).Select(_ => NewHarvest(id)).ToList();
        var results = await AtOnce(4, i => harvests.Create(inputs[i]));

        results.ShouldAllBe(r => r.Error == null);
        results.Select(r => r.Value.Id).Distinct().Count().ShouldBe(1);
        results.Select(r => r.Value.LotCode).Distinct().Count().ShouldBe(1);
        Q(c => c.Harvests.IgnoreQueryFilters().Count(h => h.ClientRequestId == id)).ShouldBe(1);
    }

    [SqlServerFact]
    public async Task Two_final_harvests_saved_at_the_same_moment_can_only_complete_the_batch_once()
    {
        var harvests = Resolve<HarvestAppService>();
        var inputs = Enumerable.Range(0, 2).Select(_ =>
        {
            var input = NewHarvest(Guid.NewGuid());
            input.HarvestType = HarvestType.Total;
            input.PondEmptiedConfirmed = true;
            return input;
        }).ToList();

        var results = await AtOnce(2, i => harvests.Create(inputs[i]));

        results.Count(r => r.Error == null).ShouldBe(1);
        results.Single(r => r.Error != null).Error.ShouldBeOfType<UserFriendlyException>()
            .Message.ShouldContain("Final harvest is already recorded");
        Q(c => c.Harvests.IgnoreQueryFilters().Count(h => h.BatchId == BatchId(CurrentBatch)
            && (h.HarvestType == HarvestType.Total || (h.HarvestType == HarvestType.Emergency && h.ShrimpLeft == false)))).ShouldBe(1);
        Q(c => c.PondBatches.IgnoreQueryFilters().Where(b => b.Id == BatchId(CurrentBatch)).Select(b => b.Status).Single())
            .ShouldBe(BatchStatus.Harvested);
    }

    [SqlServerFact]
    public async Task Retrying_the_same_final_harvest_request_returns_the_saved_harvest_after_batch_completion()
    {
        var harvests = Resolve<HarvestAppService>();
        var requestId = Guid.NewGuid();
        var input = NewHarvest(requestId);
        input.HarvestType = HarvestType.Total;
        input.PondEmptiedConfirmed = true;

        var results = await AtOnce(3, _ => harvests.Create(input));

        results.ShouldAllBe(r => r.Error == null);
        results.Select(r => r.Value.Id).Distinct().Count().ShouldBe(1);
        Q(c => c.Harvests.IgnoreQueryFilters().Count(h => h.BatchId == input.BatchId && h.ClientRequestId == requestId)).ShouldBe(1);
    }

    [SqlServerFact]
    public async Task Batch_closure_and_sale_void_are_serialized_so_accounting_cannot_become_stale()
    {
        var harvestInput = NewHarvest(null, 100);
        harvestInput.HarvestType = HarvestType.Total;
        harvestInput.PondEmptiedConfirmed = true;
        var harvest = await Resolve<HarvestAppService>().Create(harvestInput);
        var sales = Resolve<SaleAppService>();
        var sale = await sales.Create(new SaveSaleInput
        {
            BuyerId = Buyer, SaleDate = Today,
            Lines = new() { new() { HarvestGradeLineId = harvest.GradeLines.Single().Id, Kg = 100, PricePerKg = 200 } },
        });

        var batches = Resolve<BatchAppService>();
        var batchId = BatchId(CurrentBatch);
        var batch = await batches.Get(batchId);
        var results = await AtOnce(2, async i =>
        {
            if (i == 0)
            {
                await batches.Close(new CloseBatchInput { Id = batchId, ConfirmReadOnly = true, RowVersion = batch.RowVersion });
                return "closed";
            }

            await sales.Void(new VoidSaleInput { Id = sale.Id, Reason = "Buyer cancelled" });
            return "voided";
        });

        results.Count(r => r.Error == null).ShouldBe(1);
        var check = await batches.GetCloseCheck(batchId);
        var after = await batches.Get(batchId);
        if (after.Status == BatchStatus.Closed)
        {
            results.ShouldContain(r => r.Value == "closed" && r.Error == null);
            results.ShouldContain(r => r.Value == null && r.Error != null);
            check.SoldKg.ShouldBe(100m);
            check.UnaccountedKg.ShouldBe(0m);
            (await sales.Get(sale.Id)).TotalKg.ShouldBe(100m);
        }
        else
        {
            after.Status.ShouldBe(BatchStatus.Harvested);
            results.ShouldContain(r => r.Value == "voided" && r.Error == null);
            results.ShouldContain(r => r.Value == null && r.Error != null);
            check.SoldKg.ShouldBe(0m);
            check.UnaccountedKg.ShouldBe(100m);
            await Should.ThrowAsync<UserFriendlyException>(() => batches.Close(new CloseBatchInput
            {
                Id = batchId, ConfirmReadOnly = true, RowVersion = after.RowVersion,
            }));
        }
    }

    [SqlServerFact]
    public async Task Cycle_close_and_batch_reopen_are_serialized()
    {
        var harvestInput = NewHarvest(null, 100);
        harvestInput.HarvestType = HarvestType.Total;
        harvestInput.PondEmptiedConfirmed = true;
        var harvest = await Resolve<HarvestAppService>().Create(harvestInput);
        await Resolve<SaleAppService>().Create(new SaveSaleInput
        {
            BuyerId = Buyer, SaleDate = Today,
            Lines = new() { new() { HarvestGradeLineId = harvest.GradeLines.Single().Id, Kg = 100, PricePerKg = 200 } },
        });

        var batches = Resolve<BatchAppService>();
        var batchId = BatchId(CurrentBatch);
        await batches.Close(new CloseBatchInput { Id = BatchId(ReferenceBatch), ConfirmReadOnly = true });
        await batches.Close(new CloseBatchInput { Id = batchId, ConfirmReadOnly = true });

        var cycles = Resolve<CycleAppService>();
        var cycleId = CycleId("C-2026-01");
        var cycle = await cycles.Get(cycleId);
        var batch = await batches.Get(batchId);
        var results = await AtOnce(2, async i =>
        {
            if (i == 0)
            {
                await cycles.Close(new CloseCycleInput { Id = cycleId, Outcome = CycleOutcome.Completed, RowVersion = cycle.RowVersion });
                return "cycle-closed";
            }

            await batches.Reopen(new ReopenInput { Id = batchId, RowVersion = batch.RowVersion, Reason = "Correcting the batch closure" });
            return "batch-reopened";
        });

        results.Count(r => r.Error == null).ShouldBe(1);
        var afterCycle = await cycles.Get(cycleId);
        var afterBatch = await batches.Get(batchId);
        if (afterCycle.Status == CycleStatus.Closed)
        {
            results.ShouldContain(r => r.Value == "cycle-closed" && r.Error == null);
            results.ShouldContain(r => r.Value == null && r.Error != null);
            afterBatch.Status.ShouldBe(BatchStatus.Closed);
        }
        else
        {
            afterCycle.Status.ShouldBe(CycleStatus.Active);
            afterBatch.Status.ShouldBe(BatchStatus.Harvested);
            results.ShouldContain(r => r.Value == "batch-reopened" && r.Error == null);
            results.ShouldContain(r => r.Value == null && r.Error != null);
            await Should.ThrowAsync<UserFriendlyException>(() => cycles.Close(new CloseCycleInput
            {
                Id = cycleId, Outcome = CycleOutcome.Completed, RowVersion = afterCycle.RowVersion,
            }));
        }
    }

    [SqlServerFact]
    public async Task Sales_saved_at_the_same_moment_get_different_receipt_numbers_and_never_oversell()
    {
        var harvest = await Resolve<HarvestAppService>().Create(NewHarvest(null, 100));
        var line = harvest.GradeLines.Single().Id;
        var sales = Resolve<SaleAppService>();
        var buyer = Buyer;
        var results = await AtOnce(6, _ => sales.Create(new SaveSaleInput
        {
            ClientRequestId = Guid.NewGuid(), BuyerId = buyer, SaleDate = Today,
            Lines = new() { new() { HarvestGradeLineId = line, Kg = 20, PricePerKg = 250 } },
        }));

        var saved = results.Where(r => r.Error == null).Select(r => r.Value).ToList();
        saved.Count.ShouldBe(5); // 100 kg: five sales of 20 kg fit, the sixth is refused
        results.Single(r => r.Error != null).Error.ShouldBeOfType<UserFriendlyException>();
        saved.Select(s => s.DispatchReceiptNo).Distinct().Count().ShouldBe(5);
        Q(c => c.SaleLines.IgnoreQueryFilters().Where(l => l.HarvestGradeLineId == line).Sum(l => l.Kg)).ShouldBe(100m);
    }

    [SqlServerFact]
    public async Task Concurrent_usage_on_the_same_lot_serializes_stock_checks_and_flags_the_combined_shortfall()
    {
        var tenantId = GetTenantId(PilotFarm);
        var feedItemId = Q(c => c.InventoryItems.IgnoreQueryFilters()
            .Single(i => i.TenantId == tenantId && i.ProductName == "Shrimp Grower #3").Id);
        var receipt = await Resolve<InventoryAppService>().RecordReceipt(new RecordReceiptInput
        {
            ItemId = feedItemId, LotNumber = "SQL-STOCK-RACE", ReceivedDate = Today, Quantity = 100, UnitCost = 80,
        });

        var batchId = BatchId(CurrentBatch);
        var sessionIds = new[] { Guid.NewGuid(), Guid.NewGuid() };
        UsingDbContext(tenantId, c =>
        {
            c.FeedingSessions.AddRange(
                new FeedingSession { Id = sessionIds[0], TenantId = tenantId, BatchId = batchId, FeedDate = Today, Session = 7, Status = FeedingStatus.Fed, ClientRequestId = Guid.NewGuid() },
                new FeedingSession { Id = sessionIds[1], TenantId = tenantId, BatchId = batchId, FeedDate = Today, Session = 8, Status = FeedingStatus.Fed, ClientRequestId = Guid.NewGuid() });
        });

        var results = await AtOnce(2, i => InUow(async () =>
        {
            var inventory = Resolve<InventoryManager>();
            var lot = await inventory.GetLotWithItemAsync(receipt.LotId);
            return await inventory.RecordUsageAsync(lot, 80, batchId, DateTime.UtcNow,
                feedingSessionId: sessionIds[i], usedOn: Today);
        }));

        results.ShouldAllBe(r => r.Error == null);
        results.Count(r => !string.IsNullOrEmpty(r.Value.Warning)).ShouldBe(1);
        Q(c => c.InventoryLots.IgnoreQueryFilters().Single(l => l.Id == receipt.LotId).NeedsReconciliation).ShouldBeTrue();
        Q(c => c.StockMovements.IgnoreQueryFilters().Where(m => m.LotId == receipt.LotId).Sum(m => m.Quantity)).ShouldBe(-60m);
    }

    [SqlServerFact]
    public async Task A_delivery_step_waits_for_a_step_already_in_progress_then_sees_it()
    {
        var deliveries = Resolve<FryDeliveryAppService>();
        var order = await deliveries.Create(new FryDeliveryEditDto
        {
            HatcheryId = HatcheryId(GetTenantId(PilotFarm)), HatcheryBatchNumber = "SQL-LOCK", DeliveryDate = Today, PlAgeDays = 12, PlOrdered = 100000,
        });
        await deliveries.UpdateStatus(new UpdateFryDeliveryStatusInput { DeliveryId = order.Id, Status = FryDeliveryStatus.InTransit, Note = "Left the hatchery" });

        // Another save holds the delivery row, as Receive fry does while it saves.
        await using var other = Open();
        await using var transaction = (SqlTransaction)await other.BeginTransactionAsync();
        await using (var hold = new SqlCommand("SELECT Id FROM FpmsFryDeliveries WITH (UPDLOCK, ROWLOCK) WHERE Id = @id", other, transaction))
        {
            hold.Parameters.AddWithValue("@id", order.Id);
            await hold.ExecuteScalarAsync();
        }

        var clock = Stopwatch.StartNew();
        var receive = Task.Run(() => deliveries.Receive(new ReceiveFryInput { DeliveryId = order.Id, PlReceived = 101000 }));
        (await Task.WhenAny(receive, Task.Delay(1500))).ShouldNotBe(receive); // it waits for the row
        await transaction.CommitAsync();
        await receive;
        clock.ElapsedMilliseconds.ShouldBeGreaterThanOrEqualTo(1500);

        // A second Receive fry after the first sees the step already taken.
        await Should.ThrowAsync<UserFriendlyException>(() => deliveries.Receive(new ReceiveFryInput { DeliveryId = order.Id, PlReceived = 99000 }));
        (await deliveries.Get(order.Id)).PlReceived.ShouldBe(101000);
    }

    [SqlServerFact]
    public async Task A_report_reads_while_a_save_is_in_progress_without_waiting()
    {
        var harvests = Resolve<HarvestAppService>();
        var saved = await harvests.Create(NewHarvest(null));

        await using var other = Open();
        await using var transaction = (SqlTransaction)await other.BeginTransactionAsync();
        await using (var update = new SqlCommand("UPDATE FpmsHarvests SET TotalKg = 999 WHERE Id = @id", other, transaction))
        {
            update.Parameters.AddWithValue("@id", saved.Id);
            await update.ExecuteNonQueryAsync();
        }

        var read = harvests.Get(saved.Id);
        (await Task.WhenAny(read, Task.Delay(5000))).ShouldBe(read); // not blocked by the uncommitted update
        (await read).TotalKg.ShouldBe(300m); // and it sees the last committed value
        await transaction.RollbackAsync();
    }

    [SqlServerFact]
    public void The_database_refuses_a_second_record_with_the_same_request_id()
    {
        var id = Guid.NewGuid();
        var tenant = GetTenantId(PilotFarm);
        var batch = BatchId(CurrentBatch);
        UsingDbContext(tenant, c => c.Harvests.Add(new Harvest { Id = Guid.NewGuid(), TenantId = tenant, BatchId = batch, HarvestedAtUtc = DateTime.UtcNow, HarvestType = HarvestType.Partial, TotalKg = 1, ClientRequestId = id }));
        var error = Should.Throw<Exception>(() =>
            UsingDbContext(tenant, c => c.Harvests.Add(new Harvest { Id = Guid.NewGuid(), TenantId = tenant, BatchId = batch, HarvestedAtUtc = DateTime.UtcNow, HarvestType = HarvestType.Partial, TotalKg = 1, ClientRequestId = id })));
        DuplicateKey.Is(error).ShouldBeTrue();

        // Records without a request id (older clients) are not affected by the index.
        UsingDbContext(tenant, c =>
        {
            c.Harvests.Add(new Harvest { Id = Guid.NewGuid(), TenantId = tenant, BatchId = batch, HarvestedAtUtc = DateTime.UtcNow, HarvestType = HarvestType.Partial, TotalKg = 1 });
            c.Harvests.Add(new Harvest { Id = Guid.NewGuid(), TenantId = tenant, BatchId = batch, HarvestedAtUtc = DateTime.UtcNow, HarvestType = HarvestType.Partial, TotalKg = 1 });
        });
    }
}
