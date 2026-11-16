using Abp.Events.Bus;
using Abp.Events.Bus.Entities;
using Capstone.EntityFrameworkCore.Seed.Development;
using Capstone.Harvests;
using Capstone.Ponds;
using Capstone.Production;
using Microsoft.EntityFrameworkCore;
using Shouldly;
using System;
using System.Linq;
using System.Threading.Tasks;
using Xunit;

namespace Capstone.Tests.Fpms;

/// <summary>The logbook sample farm (FPMS_Logbook): three ponds, one per construction type, run as the partner farm's paper logbook shows it.</summary>
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
    public async Task One_pond_per_construction_type_named_as_in_the_simple_sample()
    {
        var ponds = await Resolve<PondAppService>().GetAll(includeArchived: true);
        ponds.Select(p => p.PondCode).OrderBy(c => c).ShouldBe(new[] { "CP-01", "EP-01", "HP-01" });
        ponds.ShouldAllBe(p => p.Status == PondDisplayStatus.InProduction);
        Q(c => c.Ponds.IgnoreQueryFilters().Where(p => p.TenantId == _farm).Select(p => p.ConstructionType).ToList())
            .OrderBy(t => t).ShouldBe(new[] { PondConstructionType.Earthen, PondConstructionType.Concrete, PondConstructionType.HdpeLined }.OrderBy(t => t));

        var batches = Q(c => c.PondBatches.IgnoreQueryFilters().Where(b => b.TenantId == _farm).ToList());
        batches.Count.ShouldBe(6);
        batches.ShouldAllBe(b => b.DensityFlag == DensityFlag.Within);
        batches.Count(b => b.Status == BatchStatus.Closed).ShouldBe(3);
        batches.Count(b => b.Status == BatchStatus.Stocked).ShouldBe(3);

        Q(c => c.Users.IgnoreQueryFilters().Where(u => u.TenantId == _farm).Select(u => u.Name).ToList()).OrderBy(n => n).ShouldBe(new[] { "Iba", "Mas", "Mik" });
    }

    [Fact]
    public void The_logbook_pond_is_closed_with_the_logbook_figures()
    {
        var ep = Q(c => c.PondBatches.IgnoreQueryFilters().Where(b => b.TenantId == _farm && b.Pond.PondCode == "EP-01").OrderBy(b => b.StockingDate).ToList());
        var closed = ep[0];
        closed.Status.ShouldBe(BatchStatus.Closed);
        closed.StockingDate.ShouldBe(new DateOnly(2026, 3, 18));
        closed.PlCountStocked.ShouldBe(117_810);
        closed.CultureDays.ShouldBe(87);
        closed.TotalHarvestKg.ShouldBe(LogbookSampleDataBuilder.HarvestKg);
        closed.FinalAbwG.ShouldBe(LogbookSampleDataBuilder.HarvestAbwG);
        // DOC 0–60 as written (1,662 kg) plus DOC 61–81 at 15 kg a feeding.
        closed.TotalFeedKg.ShouldBe(2922m);
        closed.FinalFcr.Value.ShouldBe(1.44m, 0.01m);
        closed.SurvivalRatePct.Value.ShouldBe(88.7m, 0.1m);
        ep[1].Status.ShouldBe(BatchStatus.Stocked);

        // The back page's losses, and the sales at the tally sheet's base-ABW terms: ₱210 at 10 g plus ₱5 a gram.
        Q(c => c.MortalityDetails.IgnoreQueryFilters().Where(m => m.TenantId == _farm && c.ProductionLogs.Any(l => l.Id == m.Id && l.BatchId == closed.Id)).Sum(m => m.Count)).ShouldBe(723);
        Q(c => c.SaleLines.IgnoreQueryFilters().Where(l => l.TenantId == _farm).Select(l => l.PricePerKg).ToList()).OrderBy(p => p).ShouldBe(new[] { 253m, 257m, 259m });

        // The lined ponds end with believable figures too.
        var others = Q(c => c.PondBatches.IgnoreQueryFilters().Where(b => b.TenantId == _farm && b.Status == BatchStatus.Closed && b.Pond.PondCode != "EP-01").ToList());
        others.ShouldAllBe(b => b.SurvivalRatePct > 80m && b.SurvivalRatePct < 95m && b.FinalFcr > 1.2m && b.FinalFcr < 1.7m);
    }

    [Fact]
    public void No_feed_lot_goes_below_zero()
    {
        var balances = Q(c => c.StockMovements.IgnoreQueryFilters().Where(m => m.TenantId == _farm).GroupBy(m => m.LotId).Select(g => g.Sum(m => m.Quantity)).ToList());
        balances.ShouldNotBeEmpty();
        balances.ShouldAllBe(b => b >= 0m);
    }

    [Fact]
    public async Task Each_pond_has_one_ungraded_total_harvest_sold_to_the_one_buyer()
    {
        var harvests = (await Resolve<HarvestAppService>().GetList(new GetHarvestsInput { MaxResultCount = 10 })).Items;
        harvests.Count.ShouldBe(3);
        harvests.ShouldAllBe(h => h.HarvestType == HarvestType.Total && h.SaleStatus == HarvestSaleStatus.Sold);
    }
}
