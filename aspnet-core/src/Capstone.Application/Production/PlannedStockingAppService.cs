using Abp.Authorization;
using Abp.Domain.Repositories;
using Abp.UI;
using Capstone.Authorization;
using Capstone.Ponds;
using Capstone.Resources;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Linq;
using System.Threading.Tasks;

namespace Capstone.Production;

public class PlannedStockingDto
{
    public Guid Id { get; set; }
    public Guid PondId { get; set; }
    public string PondCode { get; set; }
    public string PondName { get; set; }
    public Guid? FryDeliveryId { get; set; }
    public string HatcheryBatchNumber { get; set; }
    public string HatcheryName { get; set; }
    public DateOnly PlannedDate { get; set; }
    public string Notes { get; set; }
    public PlannedStockingStatus Status { get; set; }
}

public class SavePlannedStockingInput
{
    public Guid? Id { get; set; }

    [Required]
    public Guid PondId { get; set; }

    public Guid? FryDeliveryId { get; set; }

    [Required]
    public DateOnly PlannedDate { get; set; }

    [StringLength(PlannedStocking.MaxNotesLength)]
    public string Notes { get; set; }
}

/// <summary>Advance stocking plans. These records never create or modify actual production batches.</summary>
[AbpAuthorize(PermissionNames.Production)]
public class PlannedStockingAppService : CapstoneAppServiceBase
{
    private readonly IRepository<PlannedStocking, Guid> _plans;
    private readonly IRepository<Pond, Guid> _ponds;
    private readonly IRepository<FryDelivery, Guid> _deliveries;

    public PlannedStockingAppService(
        IRepository<PlannedStocking, Guid> plans,
        IRepository<Pond, Guid> ponds,
        IRepository<FryDelivery, Guid> deliveries)
    {
        _plans = plans;
        _ponds = ponds;
        _deliveries = deliveries;
    }

    public virtual async Task<List<PlannedStockingDto>> GetAll()
    {
        var plans = await _plans.GetAll().AsNoTracking()
            .Include(x => x.Pond)
            .Include(x => x.FryDelivery).ThenInclude(x => x.Hatchery)
            .OrderBy(x => x.PlannedDate).ThenBy(x => x.Pond.PondCode)
            .ToListAsync();

        return plans.Select(ToDto).ToList();
    }

    [AbpAuthorize(PermissionNames.Production_Manage)]
    public virtual async Task<PlannedStockingDto> Save(SavePlannedStockingInput input)
    {
        if (input.PlannedDate < await Farm.GetTodayAsync())
            throw new UserFriendlyException("The planned stocking date cannot be in the past. Record an actual stocking through Stock a batch.");

        var pond = await _ponds.GetAll().FirstOrDefaultAsync(x => x.Id == input.PondId)
            ?? throw new UserFriendlyException("Pond not found.");
        if (pond.IsArchived || pond.Purpose != PondPurpose.GrowOut)
            throw new UserFriendlyException("Choose an active grow-out pond.");

        if (input.FryDeliveryId.HasValue)
        {
            var delivery = await _deliveries.GetAll().FirstOrDefaultAsync(x => x.Id == input.FryDeliveryId.Value)
                ?? throw new UserFriendlyException("Fry delivery not found.");
            if (delivery.Status == FryDeliveryStatus.Cancelled)
                throw new UserFriendlyException("A cancelled fry delivery cannot be linked to a stocking plan.");
        }

        PlannedStocking plan;
        if (input.Id.HasValue)
        {
            plan = await _plans.GetAll().Include(x => x.Pond).Include(x => x.FryDelivery).ThenInclude(x => x.Hatchery)
                .FirstOrDefaultAsync(x => x.Id == input.Id.Value)
                ?? throw new UserFriendlyException("Stocking plan not found.");
            if (plan.Status != PlannedStockingStatus.Planned)
                throw new UserFriendlyException("Only a planned event can be changed.");
            plan.PondId = input.PondId;
            plan.FryDeliveryId = input.FryDeliveryId;
            plan.PlannedDate = input.PlannedDate;
            plan.Notes = string.IsNullOrWhiteSpace(input.Notes) ? null : input.Notes.Trim();
        }
        else
        {
            plan = new PlannedStocking
            {
                PondId = input.PondId,
                FryDeliveryId = input.FryDeliveryId,
                PlannedDate = input.PlannedDate,
                Notes = string.IsNullOrWhiteSpace(input.Notes) ? null : input.Notes.Trim(),
                Status = PlannedStockingStatus.Planned
            };
            plan.Id = await _plans.InsertAndGetIdAsync(plan);
            plan.Pond = pond;
            if (input.FryDeliveryId.HasValue)
                plan.FryDelivery = await _deliveries.GetAll().Include(x => x.Hatchery).FirstAsync(x => x.Id == input.FryDeliveryId.Value);
        }

        return ToDto(plan);
    }

    [AbpAuthorize(PermissionNames.Production_Manage)]
    public virtual async Task Cancel(Guid id)
    {
        var plan = await _plans.GetAsync(id);
        if (plan.Status != PlannedStockingStatus.Planned)
            throw new UserFriendlyException("Only a planned event can be cancelled.");
        plan.Status = PlannedStockingStatus.Cancelled;
        plan.CancelledAtUtc = DateTime.UtcNow;
    }

    private static PlannedStockingDto ToDto(PlannedStocking x) => new()
    {
        Id = x.Id,
        PondId = x.PondId,
        PondCode = x.Pond?.PondCode,
        PondName = x.Pond?.Name,
        FryDeliveryId = x.FryDeliveryId,
        HatcheryBatchNumber = x.FryDelivery?.HatcheryBatchNumber,
        HatcheryName = x.FryDelivery?.Hatchery?.Name,
        PlannedDate = x.PlannedDate,
        Notes = x.Notes,
        Status = x.Status
    };
}
