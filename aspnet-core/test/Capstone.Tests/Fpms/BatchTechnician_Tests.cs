using Abp.Authorization;
using Abp.UI;
using Capstone.Domain;
using Capstone.Logbooks;
using Capstone.Logbooks.Dto;
using Capstone.Production;
using Capstone.Production.Dto;
using Microsoft.EntityFrameworkCore;
using Shouldly;
using System;
using System.Linq;
using System.Threading.Tasks;
using Xunit;

namespace Capstone.Tests.Fpms;

/// <summary>DEC-127: the technician who looks after a batch, and a cover for days off. Names and defaults only; nothing is blocked.</summary>
public class BatchTechnician_Tests : FpmsTestBase
{
    private static DateOnly Today => FarmClock.Today(FarmClock.Resolve(FarmClock.DefaultTimeZone));

    private long UserId(string userName)
    {
        var tenantId = GetTenantId(PilotFarm);
        return Q(c => c.Users.IgnoreQueryFilters().Single(u => u.UserName == userName && u.TenantId == tenantId).Id);
    }

    [Fact]
    public async Task The_owner_assigns_a_technician_who_then_sees_the_batch_as_theirs()
    {
        var batchId = BatchId(CurrentBatch);
        var tech = UserId("tech");
        await Resolve<BatchAppService>().SetTechnician(new SetBatchTechnicianInput { Id = batchId, TechnicianUserId = tech });

        var asOwner = await Resolve<BatchAppService>().Get(batchId);
        asOwner.TechnicianName.ShouldBe("Tomas Technician");
        asOwner.IsMine.ShouldBeFalse();

        LoginAsPilotTechnician();
        var mine = (await Resolve<BatchAppService>().GetAll(new GetBatchesInput { OpenOnly = true })).Single(b => b.Id == batchId);
        mine.IsMine.ShouldBeTrue();

        var status = await Resolve<FeedingAppService>().GetDailyStatus(new GetDailyLogStatusInput());
        status.Rows.First().BatchId.ShouldBe(batchId); // the technician's own pond first
        status.Rows.First().IsMine.ShouldBeTrue();
        status.Rows.First().TechnicianName.ShouldBe("Tomas Technician");
    }

    [Fact]
    public async Task A_cover_looks_after_the_batch_until_their_last_day()
    {
        var batchId = BatchId(CurrentBatch);
        var owner = UserId("owner");
        var tech = UserId("tech");
        await Resolve<BatchAppService>().SetTechnician(new SetBatchTechnicianInput { Id = batchId, TechnicianUserId = tech, CoverUserId = owner, CoverUntil = Today });

        var dto = await Resolve<BatchAppService>().Get(batchId);
        dto.CoverName.ShouldNotBeNull();
        dto.IsMine.ShouldBeTrue(); // the owner is covering today

        var batch = Q(c => c.PondBatches.IgnoreQueryFilters().Single(b => b.Id == batchId));
        batch.IsLookedAfterBy(owner, Today.AddDays(1)).ShouldBeFalse(); // the cover ends after its last day
        batch.IsLookedAfterBy(tech, Today.AddDays(1)).ShouldBeTrue();
    }

    [Fact]
    public async Task Bad_assignments_are_refused_and_only_the_owner_may_assign()
    {
        var service = Resolve<BatchAppService>();
        var batchId = BatchId(CurrentBatch);
        var tech = UserId("tech");

        await Should.ThrowAsync<UserFriendlyException>(() => service.SetTechnician(new SetBatchTechnicianInput { Id = batchId, CoverUserId = tech }));
        await Should.ThrowAsync<UserFriendlyException>(() => service.SetTechnician(new SetBatchTechnicianInput { Id = batchId, TechnicianUserId = tech, CoverUserId = tech }));
        await Should.ThrowAsync<UserFriendlyException>(() => service.SetTechnician(new SetBatchTechnicianInput { Id = batchId, TechnicianUserId = tech, CoverUserId = UserId("owner"), CoverUntil = Today.AddDays(-1) }));
        await Should.ThrowAsync<UserFriendlyException>(() => service.SetTechnician(new SetBatchTechnicianInput { Id = batchId, TechnicianUserId = 999999 }));

        LoginAsPilotTechnician();
        await Should.ThrowAsync<AbpAuthorizationException>(() => Resolve<BatchAppService>().SetTechnician(new SetBatchTechnicianInput { Id = batchId, TechnicianUserId = tech }));
    }
}
