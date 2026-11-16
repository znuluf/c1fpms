using Abp.Events.Bus;
using Abp.Events.Bus.Entities;
using Capstone.EntityFrameworkCore.Seed.Development;
using Capstone.Ponds;
using Microsoft.EntityFrameworkCore;
using Shouldly;
using System.Linq;
using System.Threading.Tasks;
using Xunit;

namespace Capstone.Tests.Fpms;

/// <summary>
/// Both sample farms seeded into one database: each is its own farm (tenant) with its own accounts, and neither sees the
/// other's ponds, even though both have ponds named EP-01, CP-01 and HP-01.
/// </summary>
public class TwoSampleFarms_Tests : FpmsTestBase
{
    public TwoSampleFarms_Tests()
    {
        UsingDbContext(null, context =>
        {
            context.EntityChangeEventHelper = NullEntityChangeEventHelper.Instance;
            context.EventBus = NullEventBus.Instance;
            context.SuppressAutoSetTenantId = true;
            new SimpleSampleDataBuilder(context).Create();
            new LogbookSampleDataBuilder(context).Create();
        });
    }

    [Fact]
    public async Task Each_farm_sees_only_its_own_ponds()
    {
        var simple = GetTenantId(SimpleSampleDataBuilder.FarmCode);
        var logbook = GetTenantId(LogbookSampleDataBuilder.FarmCode);
        simple.ShouldNotBe(logbook);

        LoginAsTenant(LogbookSampleDataBuilder.FarmCode, LogbookSampleDataBuilder.OwnerUserName);
        var logbookPonds = await Resolve<PondAppService>().GetAll(includeArchived: true);
        logbookPonds.Select(p => p.PondCode).OrderBy(c => c).ShouldBe(new[] { "CP-01", "EP-01", "HP-01" });

        LoginAsTenant(SimpleSampleDataBuilder.FarmCode, "arkabubba");
        var simplePonds = await Resolve<PondAppService>().GetAll(includeArchived: true);
        simplePonds.Select(p => p.PondCode).OrderBy(c => c).ShouldBe(new[] { "CP-01", "EP-01", "EP-02", "HP-01", "HP-02" });
        simplePonds.Select(p => p.Id).Intersect(logbookPonds.Select(p => p.Id)).ShouldBeEmpty();

        // Each farm's records carry its own farm id.
        Q(c => c.Ponds.IgnoreQueryFilters().Count(p => p.TenantId == logbook)).ShouldBe(3);
        Q(c => c.Ponds.IgnoreQueryFilters().Count(p => p.TenantId == simple)).ShouldBe(5);
    }
}
