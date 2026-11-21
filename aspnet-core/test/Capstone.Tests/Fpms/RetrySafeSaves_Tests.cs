using Abp.UI;
using Capstone.Domain;
using Capstone.Farms;
using Capstone.Harvests;
using Capstone.Logbooks;
using Capstone.Logbooks.Dto;
using Capstone.Production;
using Capstone.Sales;
using Microsoft.EntityFrameworkCore;
using Shouldly;
using System;
using System.Linq;
using System.Threading.Tasks;
using Xunit;

namespace Capstone.Tests.Fpms;

/// <summary>
/// DEC-133: a save retried after a lost connection returns the record already saved, and a correction from a stale page is
/// refused instead of saved over someone else's. The test database (EF in-memory) does not stamp row versions, so the
/// version tests set one by hand first.
/// </summary>
public class RetrySafeSaves_Tests : FpmsTestBase
{
    private static DateOnly Today => FarmClock.Today(FarmClock.Resolve(FarmClock.DefaultTimeZone));
    private static readonly byte[] Version1 = { 0, 0, 0, 0, 0, 0, 0, 1 };
    private static readonly string Version1Text = Convert.ToBase64String(Version1);
    private const string StaleVersion = "AAAAAAAAAAA=";

    private Guid Grade(string label) => Q(c => c.SizeGrades.IgnoreQueryFilters().Single(g => g.Label == label && g.TenantId == GetTenantId(PilotFarm)).Id);
    private Guid Buyer => Q(c => c.Buyers.IgnoreQueryFilters().First(b => b.Name.StartsWith("GenSan")).Id);

    private SaveHarvestInput NewHarvest(Guid? requestId) => new()
    {
        BatchId = BatchId(CurrentBatch), HarvestedAt = DateTime.UtcNow.AddHours(-2), HarvestType = HarvestType.Partial, TotalKg = 300, AbwG = 9,
        GradeLines = new() { new GradeLineInput { SizeGradeId = Grade("100/120"), Kg = 300 } }, ClientRequestId = requestId,
    };

    private int Count<T>(Func<Capstone.EntityFrameworkCore.CapstoneDbContext, IQueryable<T>> set) => Q(c => set(c).Count());

    [Fact]
    public async Task A_retried_harvest_returns_the_harvest_already_saved()
    {
        var id = Guid.NewGuid();
        var harvests = Resolve<HarvestAppService>();
        var first = await harvests.Create(NewHarvest(id));
        var before = Count(c => c.Harvests.IgnoreQueryFilters());
        var again = await harvests.Create(NewHarvest(id));
        again.Id.ShouldBe(first.Id);
        again.LotCode.ShouldBe(first.LotCode);
        Count(c => c.Harvests.IgnoreQueryFilters()).ShouldBe(before);

        // Without a request id (older clients) each save is a new harvest, as before.
        await harvests.Create(NewHarvest(null));
        Count(c => c.Harvests.IgnoreQueryFilters()).ShouldBe(before + 1);
    }

    [Fact]
    public async Task A_retried_sale_returns_the_sale_already_saved_with_its_receipt_number()
    {
        var harvest = await Resolve<HarvestAppService>().Create(NewHarvest(null));
        var sales = Resolve<SaleAppService>();
        SaveSaleInput Sale(Guid id) => new()
        {
            ClientRequestId = id, BuyerId = Buyer, SaleDate = Today,
            Lines = new() { new() { HarvestGradeLineId = harvest.GradeLines.Single().Id, Kg = 100, PricePerKg = 250 } },
        };
        var id = Guid.NewGuid();
        var first = await sales.Create(Sale(id));
        var again = await sales.Create(Sale(id));
        again.Id.ShouldBe(first.Id);
        again.DispatchReceiptNo.ShouldBe(first.DispatchReceiptNo);
        Count(c => c.Sales.IgnoreQueryFilters().Where(s => s.ClientRequestId == id)).ShouldBe(1);
    }

    [Fact]
    public async Task A_stale_harvest_or_sale_correction_is_refused()
    {
        var harvests = Resolve<HarvestAppService>();
        var harvest = await harvests.Create(NewHarvest(null));
        var sale = await Resolve<SaleAppService>().Create(new SaveSaleInput
        {
            BuyerId = Buyer, SaleDate = Today, Lines = new() { new() { HarvestGradeLineId = harvest.GradeLines.Single().Id, Kg = 50, PricePerKg = 250 } },
        });
        UsingDbContext(GetTenantId(PilotFarm), c =>
        {
            c.Harvests.IgnoreQueryFilters().Single(h => h.Id == harvest.Id).RowVersion = Version1;
            c.Sales.IgnoreQueryFilters().Single(s => s.Id == sale.Id).RowVersion = Version1;
        });

        var edit = NewHarvest(null);
        edit.Id = harvest.Id;
        edit.RowVersion = StaleVersion;
        var error = await Should.ThrowAsync<UserFriendlyException>(() => harvests.Update(edit));
        error.Message.ShouldContain("changed by someone else");
        edit.RowVersion = Version1Text;
        await harvests.Update(edit);

        var saleEdit = new SaveSaleInput
        {
            Id = sale.Id, RowVersion = StaleVersion, BuyerId = Buyer, SaleDate = Today,
            Lines = new() { new() { HarvestGradeLineId = harvest.GradeLines.Single().Id, Kg = 60, PricePerKg = 250 } },
        };
        await Should.ThrowAsync<UserFriendlyException>(() => Resolve<SaleAppService>().Update(saleEdit));
        saleEdit.RowVersion = Version1Text;
        (await Resolve<SaleAppService>().Update(saleEdit)).Lines.Single().Kg.ShouldBe(60m);
    }

    [Fact]
    public async Task A_retried_log_entry_returns_the_entry_already_saved()
    {
        var logs = Resolve<LogAppService>();
        SaveLogInput Note(Guid id) => new()
        {
            BatchId = BatchId(CurrentBatch), LogType = LogType.GeneralNote, ObservedAt = DateTime.UtcNow.AddMinutes(-5), Notes = "Aerator 3 restarted",
            ClientRequestId = id,
        };
        var id = Guid.NewGuid();
        var first = await logs.Create(Note(id));
        var again = await logs.Create(Note(id));
        again.Log.Id.ShouldBe(first.Log.Id);
        Count(c => c.ProductionLogs.IgnoreQueryFilters().Where(l => l.ClientRequestId == id)).ShouldBe(1);
    }

    [Fact]
    public async Task A_stale_log_correction_or_farm_profile_save_is_refused()
    {
        var logs = Resolve<LogAppService>();
        var saved = await logs.Create(new SaveLogInput
        {
            BatchId = BatchId(CurrentBatch), LogType = LogType.GeneralNote, ObservedAt = DateTime.UtcNow.AddMinutes(-5), Notes = "Paddlewheel 2 noisy",
            ClientRequestId = Guid.NewGuid(),
        });
        var logId = saved.Log.Id;
        UsingDbContext(GetTenantId(PilotFarm), c => c.ProductionLogs.IgnoreQueryFilters().Single(l => l.Id == logId).RowVersion = Version1);
        var fix = new SaveLogInput
        {
            Id = logId, RowVersion = StaleVersion, BatchId = BatchId(CurrentBatch), LogType = LogType.GeneralNote,
            ObservedAt = DateTime.UtcNow.AddMinutes(-5), Notes = "Paddlewheel 2 noisy; checked", ClientRequestId = Guid.NewGuid(),
        };
        await Should.ThrowAsync<UserFriendlyException>(() => logs.Update(fix));
        fix.RowVersion = Version1Text;
        await logs.Update(fix);

        var profiles = Resolve<FarmProfileAppService>();
        var profile = await profiles.Get();
        UsingDbContext(GetTenantId(PilotFarm), c => c.FarmProfiles.IgnoreQueryFilters().Single(p => p.TenantId == GetTenantId(PilotFarm)).RowVersion = Version1);
        profile.RowVersion = StaleVersion;
        await Should.ThrowAsync<UserFriendlyException>(() => profiles.Update(profile));
        profile.RowVersion = Version1Text;
        await profiles.Update(profile);
    }
}
