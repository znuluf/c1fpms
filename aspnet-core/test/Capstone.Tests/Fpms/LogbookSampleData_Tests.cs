using Abp.Events.Bus;
using Abp.Events.Bus.Entities;
using Capstone.EntityFrameworkCore.Seed.Development;
using Capstone.Harvests;
using Capstone.Production;
using Microsoft.EntityFrameworkCore;
using Shouldly;
using System;
using System.Linq;
using System.Threading.Tasks;
using Xunit;

namespace Capstone.Tests.Fpms;

/// <summary>The logbook sample farm (FPMS_Logbook): one earthen pond run as the partner farm's paper logbook shows it.</summary>
public class LogbookSampleData_Tests : FpmsTestBase
{
    private readonly int _farm;

    public LogbookSampleData_Tests()
    {
        UsingDbContext(null, context =>
        {
            context.EntityChangeEventHelper = NullEntityChangeEventHelper.Instance;
            context.EventBus = NullEventBus.Instance;
            context.SuppressAutoSetTenantId = true;
            new LogbookSampleDataBuilder(context).Create();
            new LogbookSampleDataBuilder(context).Create(); // a second run adds nothing
        });
        _farm = GetTenantId(LogbookSampleDataBuilder.FarmCode);
        LoginAsTenant(LogbookSampleDataBuilder.FarmCode, LogbookSampleDataBuilder.OwnerUserName);
    }

    [Fact]
    public void The_logbook_feed_table_is_transcribed()
    {
        LogbookSampleDataBuilder.LogbookFeeding(0).ShouldBe(new decimal?[] { null, null, 0.5m, 0.5m });
        LogbookSampleDataBuilder.LogbookFeeding(19).ShouldBe(new decimal?[] { 2.7m, 2.7m, 3m, 3m });
        LogbookSampleDataBuilder.LogbookFeeding(25).ShouldAllBe(kg => kg == 3.5m);
        LogbookSampleDataBuilder.LogbookFeeding(26).ShouldAllBe(kg => kg == 3.7m);
        LogbookSampleDataBuilder.LogbookFeeding(50).ShouldAllBe(kg => kg == 14m);
        LogbookSampleDataBuilder.LogbookFeeding(60).ShouldAllBe(kg => kg == 15m);
        Enumerable.Range(0, 61).Sum(d => LogbookSampleDataBuilder.LogbookFeeding(d).Sum(kg => kg ?? 0m)).ShouldBe(1662m);
    }

    [Fact]
    public void The_logbook_cycle_is_closed_with_the_logbook_figures()
    {
        var batches = Q(c => c.PondBatches.IgnoreQueryFilters().Where(b => b.TenantId == _farm).OrderBy(b => b.StockingDate).ToList());
        batches.Count.ShouldBe(2);
        var closed = batches[0];
        closed.Status.ShouldBe(BatchStatus.Closed);
        closed.StockingDate.ShouldBe(new DateOnly(2026, 3, 18));
        closed.PlCountStocked.ShouldBe(117_810);
        closed.DensityFlag.ShouldBe(DensityFlag.Within);
        closed.CultureDays.ShouldBe(87);
        closed.TotalHarvestKg.ShouldBe(LogbookSampleDataBuilder.HarvestKg);
        closed.FinalAbwG.ShouldBe(LogbookSampleDataBuilder.HarvestAbwG);
        // DOC 0–60 as written (1,662 kg) plus DOC 61–81 at 15 kg a feeding from the sacks bought.
        closed.TotalFeedKg.ShouldBe(2922m);
        closed.FinalFcr.Value.ShouldBe(1.44m, 0.01m);
        closed.SurvivalRatePct.Value.ShouldBe(88.7m, 0.1m);

        batches[1].Status.ShouldBe(BatchStatus.Stocked);
        Q(c => c.ProductionCycles.IgnoreQueryFilters().Count(x => x.TenantId == _farm && x.Status == CycleStatus.Active)).ShouldBe(1);

        // The back page's losses, and the sale at the tally sheet's base-ABW terms: ₱210 at 10 g plus ₱5 a gram → ₱257.
        Q(c => c.MortalityDetails.IgnoreQueryFilters().Where(m => m.TenantId == _farm && c.ProductionLogs.Any(l => l.Id == m.Id && l.BatchId == closed.Id)).Sum(m => m.Count)).ShouldBe(723);
        Q(c => c.SaleLines.IgnoreQueryFilters().Where(l => l.TenantId == _farm).Select(l => l.PricePerKg).ToList()).ShouldBe(new[] { 257m });
    }

    [Fact]
    public void No_feed_lot_goes_below_zero()
    {
        var balances = Q(c => c.StockMovements.IgnoreQueryFilters().Where(m => m.TenantId == _farm).GroupBy(m => m.LotId).Select(g => g.Sum(m => m.Quantity)).ToList());
        balances.ShouldNotBeEmpty();
        balances.ShouldAllBe(b => b >= 0m);
    }

    [Fact]
    public async Task The_harvest_is_one_ungraded_total_sold_to_one_buyer()
    {
        var harvests = (await Resolve<HarvestAppService>().GetList(new GetHarvestsInput { MaxResultCount = 10 })).Items;
        var h = harvests.ShouldHaveSingleItem();
        h.HarvestType.ShouldBe(HarvestType.Total);
        h.SaleStatus.ShouldBe(HarvestSaleStatus.Sold);
    }
}
