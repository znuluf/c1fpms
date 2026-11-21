using Abp.Application.Services.Dto;
using Abp.Authorization;
using Abp.Domain.Repositories;
using Abp.UI;
using Capstone.Authorization;
using Capstone.Common;
using Capstone.Production.Dto;
using Capstone.Domain;
using Capstone.Ponds;
using Capstone.Production;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Linq;
using System.Threading.Tasks;

namespace Capstone.Resources;

public class FryDeliveryEditDto
{
    public Guid Id { get; set; }
    public Guid HatcheryId { get; set; }

    [Required, StringLength(FryDelivery.MaxBatchNumberLength)]
    public string HatcheryBatchNumber { get; set; }

    public DateOnly DeliveryDate { get; set; }

    [Range(1, 60, ErrorMessage = "PL age must be between 1 and 60 days.")]
    public int? PlAgeDays { get; set; }

    /// <summary>PL counted at the farm; required once the fry have arrived, empty for an order (DEC-131).</summary>
    [Range(1, FryDelivery.MaxPl, ErrorMessage = "PL counted at the farm must be between 1 and 10,000,000.")]
    public long? PlReceived { get; set; }

    /// <summary>Create as Received only: when the fry arrived (defaults to now). Its farm date becomes the delivery date.</summary>
    public DateTime? ReceivedAt { get; set; }

    /// <summary>PL on the hatchery's papers, optional (DEC-93).</summary>
    [Range(1, FryDelivery.MaxPl, ErrorMessage = "PL ordered (PO) must be between 1 and 10,000,000.")]
    public long? PlOrdered { get; set; }

    [Range(0, 1000000000)]
    public decimal? CostPhp { get; set; }

    [StringLength(FryDelivery.MaxNotesLength)]
    public string Notes { get; set; }

    [StringLength(FryDelivery.MaxPermitLength)]
    public string PlHealthCertificateNo { get; set; }

    [StringLength(FryDelivery.MaxPermitLength)]
    public string TransportPermitNo { get; set; }

    [StringLength(FryDelivery.MaxPermitLength)]
    public string SfscNo { get; set; }

    /// <summary>How the fry travelled, optional (DEC-128).</summary>
    public Production.TransportMode? TransportMode { get; set; }

    /// <summary>When the hatchery packed the fry (ISO with offset), optional; not after the delivery day (DEC-128).</summary>
    public DateTime? TimePacked { get; set; }

    /// <summary>Create only: Received (logged at the gate), or Ordered / In transit for an order not yet here (DEC-131).</summary>
    public FryDeliveryStatus InitialStatus { get; set; } = FryDeliveryStatus.Ordered;

    public string RowVersion { get; set; }
    public List<FryDeliveryPondAllocationInput> PondAllocations { get; set; } = new();
}

public class FryDeliveryPondAllocationInput { public Guid PondId { get; set; } [Range(1, FryDelivery.MaxPl)] public long PlannedPlCount { get; set; } }
public class FryDeliveryPondAllocationDto { public Guid Id { get; set; } public Guid PondId { get; set; } public string PondCode { get; set; } public string PondName { get; set; } public long PlannedPlCount { get; set; } public DateTime? ReleasedAtUtc { get; set; } public DateTime? FulfilledAtUtc { get; set; } public Guid? PondBatchId { get; set; } }
public class FryDeliveryPondOptionDto { public Guid Id { get; set; } public string PondCode { get; set; } public string Name { get; set; } public PondDisplayStatus Status { get; set; } public bool IsReserved { get; set; } public string ReservedByDelivery { get; set; } }

public class FryDeliveryDto
{
    public Guid Id { get; set; }
    public Guid HatcheryId { get; set; }
    public string HatcheryName { get; set; }
    public string HatcheryShortCode { get; set; }
    public string HatcheryBatchNumber { get; set; }
    public DateOnly DeliveryDate { get; set; }
    public int? PlAgeDays { get; set; }
    public long? PlReceived { get; set; }
    public DateTime? ReceivedAtUtc { get; set; }
    public long? PlOrdered { get; set; }
    public decimal? CostPhp { get; set; }
    public string Notes { get; set; }
    public string PlHealthCertificateNo { get; set; }
    public string TransportPermitNo { get; set; }
    public string SfscNo { get; set; }
    public Production.TransportMode? TransportMode { get; set; }
    public DateTime? TimePackedUtc { get; set; }
    public FryDeliveryStatus Status { get; set; }

    /// <summary>Finish stocking was recorded (DEC-63).</summary>
    public bool IsStockingFinished { get; set; }

    public DateTime? StockingFinishedAtUtc { get; set; }

    /// <summary>PL recorded as not stocked at Finish stocking.</summary>
    public long PlNotStocked { get; set; }
    public DateTime StatusChangedAtUtc { get; set; }

    /// <summary>True when a production cycle uses this delivery (shown as "Stocked").</summary>
    public bool IsStocked { get; set; }

    public Guid? CycleId { get; set; }
    public string CycleCode { get; set; }
    public long PlStocked { get; set; }
    public long PlLeft { get; set; }
    public string RowVersion { get; set; }
    public List<FryDeliveryPondAllocationDto> PondAllocations { get; set; } = new();
}

public class FryDeliveryDetailDto : FryDeliveryDto
{
    public List<FryDeliveryStatusChangeDto> History { get; set; } = new();
    public List<ShortfallDto> Shortfalls { get; set; } = new();
    public string StockingFinishedBy { get; set; }
    public bool CanEdit { get; set; }
    public bool CanUpdateStatus { get; set; }

    /// <summary>Owner; a cycle uses the delivery and stocking is not finished yet (DEC-63).</summary>
    public bool CanFinishStocking { get; set; }
}

public class ShortfallDto
{
    public ShortfallReason Reason { get; set; }
    public long Count { get; set; }
    public string Note { get; set; }
}

public class ShortfallInput
{
    public ShortfallReason Reason { get; set; }

    [Range(1, FryDelivery.MaxPl)]
    public long Count { get; set; }

    [StringLength(FryDeliveryShortfall.MaxNoteLength)]
    public string Note { get; set; }
}

public class FinishStockingInput
{
    public Guid DeliveryId { get; set; }

    /// <summary>PL not stocked, by reason. Stocked + not stocked must equal PL received.</summary>
    public List<ShortfallInput> Shortfalls { get; set; } = new();

    public string RowVersion { get; set; }
}

/// <summary>A delivery from an earlier day with PL not stocked yet, shown as "Finish stocking" on the Owner's dashboard (DEC-76).</summary>
public class OpenDeliveryDto
{
    public Guid Id { get; set; }
    public string HatcheryBatchNumber { get; set; }
    public string HatcheryName { get; set; }
    public DateOnly DeliveryDate { get; set; }
    public long PlReceived { get; set; }
    public long PlStocked { get; set; }
    public Guid? CycleId { get; set; }
    public string CycleCode { get; set; }
}

public class FryDeliveryStatusChangeDto
{
    public FryDeliveryStatus Status { get; set; }
    public DateTime ChangedAtUtc { get; set; }
    public string ChangedBy { get; set; }
    public string Note { get; set; }
}

public class ReceiveFryInput
{
    public Guid DeliveryId { get; set; }

    /// <summary>When the fry arrived (defaults to now); not in the future, not before the previous step.</summary>
    public DateTime? ReceivedAt { get; set; }

    [Range(1, FryDelivery.MaxPl, ErrorMessage = "PL counted at the farm must be between 1 and 10,000,000.")]
    public long PlReceived { get; set; }

    [Range(1, 60, ErrorMessage = "PL age must be between 1 and 60 days.")]
    public int? PlAgeDays { get; set; }

    [StringLength(FryDelivery.MaxPermitLength)]
    public string PlHealthCertificateNo { get; set; }

    [StringLength(FryDelivery.MaxPermitLength)]
    public string TransportPermitNo { get; set; }

    [StringLength(FryDelivery.MaxPermitLength)]
    public string SfscNo { get; set; }

    public Production.TransportMode? TransportMode { get; set; }
    public DateTime? TimePacked { get; set; }

    [StringLength(FryDeliveryStatusChange.MaxNoteLength)]
    public string Note { get; set; }
}

public class UndoDeliveryStepInput
{
    public Guid DeliveryId { get; set; }

    [StringLength(FryDeliveryStatusChange.MaxNoteLength)]
    public string Reason { get; set; }
}

public class UpdateFryDeliveryStatusInput
{
    public Guid DeliveryId { get; set; }
    public FryDeliveryStatus Status { get; set; }

    /// <summary>When the change happened (defaults to now); not in the future.</summary>
    public DateTime? ChangedAt { get; set; }

    [StringLength(FryDeliveryStatusChange.MaxNoteLength)]
    public string Note { get; set; }
}

public class GetFryDeliveriesInput : PagedInput
{
    public Guid? HatcheryId { get; set; }
    public FryDeliveryStatus? Status { get; set; }

    /// <summary>Only Received deliveries that no cycle uses yet (the Create Batch stepper's first step).</summary>
    public bool AvailableForStocking { get; set; }
}

public class SaveFryDeliveryResult
{
    public Guid Id { get; set; }
    public List<WarningDto> Warnings { get; set; } = new();
}

/// <summary>Fry deliveries (Log Fries, Ref 3.1a, AC-06). Owners record and edit; Owners and Technicians update the status.</summary>
[AbpAuthorize(PermissionNames.FryDeliveries)]
public class FryDeliveryAppService : CapstoneAppServiceBase
{
    private readonly IRepository<FryDelivery, Guid> _deliveries;
    private readonly IRepository<FryDeliveryStatusChange, Guid> _changes;
    private readonly IRepository<HatcherySource, Guid> _hatcheries;
    private readonly IRepository<ProductionCycle, Guid> _cycles;
    private readonly IRepository<PondBatch, Guid> _batches;
    private readonly IRepository<FryDeliveryShortfall, Guid> _shortfalls;
    private readonly IRepository<FryDeliveryPondAllocation, Guid> _allocations;
    private readonly IRepository<Pond, Guid> _ponds;
    private readonly ReferenceData.FarmStandardsProvider _standards;

    private readonly IRowLocker _rowLocker;

    public FryDeliveryAppService(IRepository<FryDelivery, Guid> deliveries, IRepository<FryDeliveryStatusChange, Guid> changes,
        IRepository<HatcherySource, Guid> hatcheries, IRepository<ProductionCycle, Guid> cycles, IRepository<PondBatch, Guid> batches,
        IRepository<FryDeliveryShortfall, Guid> shortfalls, IRepository<FryDeliveryPondAllocation, Guid> allocations, IRepository<Pond, Guid> ponds,
        ReferenceData.FarmStandardsProvider standards, IRowLocker rowLocker)
    {
        _rowLocker = rowLocker;
        _shortfalls = shortfalls;
        _allocations = allocations;
        _ponds = ponds;
        _standards = standards;
        _deliveries = deliveries;
        _changes = changes;
        _hatcheries = hatcheries;
        _cycles = cycles;
        _batches = batches;
    }

    private static readonly string[] DeliverySortKeys = { "deliveryDate", "hatcheryName", "hatcheryBatchNumber", "plReceived", "status" };

    /// <summary>
    /// One page of fry deliveries (AC-27). Status is worked out from the delivery's history, so the matching deliveries are
    /// found first and then cut into pages. Sort keys: deliveryDate (default, newest first), hatcheryName, hatcheryBatchNumber, plReceived, status.
    /// </summary>
    public virtual async Task<PagedResultDto<FryDeliveryDto>> GetAll(GetFryDeliveriesInput input)
    {
        var list = await FilteredAsync(input);
        var sort = SortSpec.Parse(input.Sorting, DeliverySortKeys, "deliveryDate", true);
        IOrderedEnumerable<FryDeliveryDto> ordered = sort.Key switch
        {
            "hatcheryName" => sort.Apply(list, d => d.HatcheryName ?? string.Empty),
            "hatcheryBatchNumber" => sort.Apply(list, d => d.HatcheryBatchNumber ?? string.Empty),
            "plReceived" => sort.Apply(list, d => d.PlReceived),
            "status" => sort.Apply(list, d => (int)d.Status),
            _ => sort.Apply(list, d => d.DeliveryDate),
        };
        return ordered.ThenBy(d => d.HatcheryBatchNumber).ToList().ToPage(input);
    }

    /// <summary>Every delivery matching the filter, newest first. For CSV export only; not exposed as an API.</summary>
    internal async Task<List<FryDeliveryDto>> ListAllAsync(GetFryDeliveriesInput input) =>
        (await FilteredAsync(input)).OrderByDescending(d => d.DeliveryDate).ThenBy(d => d.HatcheryBatchNumber).ToList();

    private async Task<List<FryDeliveryDto>> FilteredAsync(GetFryDeliveriesInput input)
    {
        var deliveries = await _deliveries.GetAll().AsNoTracking().Include(d => d.Hatchery)
            .Where(d => !input.HatcheryId.HasValue || d.HatcheryId == input.HatcheryId)
            .OrderByDescending(d => d.DeliveryDate).ThenBy(d => d.HatcheryBatchNumber).ToListAsync();
        var list = await MapAsync(deliveries);
        return list
            .Where(d => SearchText.Matches(input.Search, d.HatcheryBatchNumber, d.HatcheryName, d.HatcheryShortCode, d.PlHealthCertificateNo, d.SfscNo))
            .Where(d => !input.Status.HasValue || d.Status == input.Status)
            .Where(d => !input.AvailableForStocking || (d.Status == FryDeliveryStatus.Received && !d.IsStocked && !d.IsStockingFinished))
            .ToList();
    }

    /// <summary>Deliveries per status for the toolbar chips: follows the search and hatchery but not the chosen status.</summary>
    public virtual async Task<List<StatusCountDto>> GetStatusCounts(GetFryDeliveriesInput input)
    {
        input.Status = null;
        return (await FilteredAsync(input)).GroupBy(d => d.Status).Select(g => new StatusCountDto { Status = (int)g.Key, Count = g.Count() }).ToList();
    }

    public virtual async Task<FryDeliveryDetailDto> Get(Guid id)
    {
        var d = await _deliveries.GetAll().AsNoTracking().Include(x => x.Hatchery).FirstOrDefaultAsync(x => x.Id == id)
                ?? throw new UserFriendlyException("Fry delivery not found.");
        var dto = new FryDeliveryDetailDto();
        Copy((await MapAsync(new List<FryDelivery> { d })).Single(), dto);
        var changes = await _changes.GetAll().AsNoTracking().Where(c => c.DeliveryId == id).OrderByDescending(c => c.ChangedAtUtc).ThenByDescending(c => c.CreationTime).ToListAsync();
        var names = await GetUserNamesAsync(changes.Select(c => c.CreatorUserId));
        dto.History = changes.Select(c => new FryDeliveryStatusChangeDto { Status = c.Status, ChangedAtUtc = c.ChangedAtUtc, ChangedBy = NameOf(names, c.CreatorUserId), Note = c.Note }).ToList();
        dto.Shortfalls = await _shortfalls.GetAll().AsNoTracking().Where(s => s.DeliveryId == id).OrderBy(s => s.Reason)
            .Select(s => new ShortfallDto { Reason = s.Reason, Count = s.Count, Note = s.Note }).ToListAsync();
        var finisher = await GetUserNamesAsync(new[] { d.StockingFinishedByUserId });
        dto.StockingFinishedBy = NameOf(finisher, d.StockingFinishedByUserId);
        dto.CanEdit = await IsGrantedAsync(PermissionNames.FryDeliveries_Manage);
        dto.CanUpdateStatus = !dto.IsStocked && !dto.IsStockingFinished && await IsGrantedAsync(PermissionNames.FryDeliveries_UpdateStatus);
        dto.CanFinishStocking = dto.IsStocked && !dto.IsStockingFinished && dto.CanEdit;
        var allocations = await _allocations.GetAll().AsNoTracking().Include(a => a.Pond).ThenInclude(p => p.Prefix).Where(a => a.DeliveryId == id).OrderBy(a => a.Pond.PondCode).ToListAsync();
        dto.PondAllocations = allocations.Select(a => new FryDeliveryPondAllocationDto { Id = a.Id, PondId = a.PondId, PondCode = a.Pond.PondCode, PondName = PondNaming.DisplayName(a.Pond.Prefix?.Name, a.Pond.Number), PlannedPlCount = a.PlannedPlCount, ReleasedAtUtc = a.ReleasedAtUtc, FulfilledAtUtc = a.FulfilledAtUtc, PondBatchId = a.PondBatchId }).ToList();
        return dto;
    }

    /// <summary>
    /// Finish stocking (DEC-63): the Owner records PL not stocked, by reason, so that PL received = Σ stocking counts +
    /// Σ not stocked. Afterwards the delivery cannot be stocked from again.
    /// </summary>
    [AbpAuthorize(PermissionNames.FryDeliveries_Manage)]
    public virtual async Task FinishStocking(FinishStockingInput input)
    {
        var delivery = await _deliveries.GetAsync(input.DeliveryId);
        Production.Concurrency.Check(delivery.RowVersion, input.RowVersion);
        if (delivery.IsStockingFinished)
        {
            throw new UserFriendlyException("Stocking from this delivery is already finished.");
        }

        var cycle = await _cycles.GetAll().AsNoTracking().FirstOrDefaultAsync(c => c.FryDeliveryId == delivery.Id)
                    ?? throw new UserFriendlyException("Nothing has been stocked from this delivery yet. Stock at least one pond first.");
        var lines = input.Shortfalls ?? new List<ShortfallInput>();
        foreach (var line in lines)
        {
            if (!Enum.IsDefined(line.Reason))
            {
                throw new UserFriendlyException("Choose a reason for each count of PL not stocked.");
            }

            if (line.Count <= 0)
            {
                throw new UserFriendlyException("Each count of PL not stocked must be greater than zero.");
            }
        }

        if (lines.Select(l => l.Reason).Distinct().Count() != lines.Count)
        {
            throw new UserFriendlyException("Enter each reason once.");
        }

        var stocked = await _batches.GetAll().Where(b => b.CycleId == cycle.Id).SumAsync(b => b.PlCountStocked ?? 0);
        var notStocked = lines.Sum(l => l.Count);
        if (stocked + notStocked != delivery.PlReceived)
        {
            throw new UserFriendlyException(
                $"Stocked {stocked:N0} + not stocked {notStocked:N0} = {stocked + notStocked:N0} PL, but {delivery.PlReceived:N0} PL were received. "
                + $"Record {delivery.PlReceived - stocked:N0} PL as not stocked, split by reason.");
        }

        foreach (var line in lines)
        {
            await _shortfalls.InsertAsync(new FryDeliveryShortfall
            {
                DeliveryId = delivery.Id, Reason = line.Reason, Count = line.Count, Note = string.IsNullOrWhiteSpace(line.Note) ? null : line.Note.Trim(),
            });
        }

        delivery.StockingFinishedAtUtc = DateTime.UtcNow;
        delivery.StockingFinishedByUserId = AbpSession.UserId;
    }

    /// <summary>
    /// Received deliveries from an earlier day that are not finished and still have PL that were not stocked, so the Owner can
    /// record the shortfall (dashboard "Finish stocking", DEC-76). Nothing blocks stocking from a delivery, whatever its age.
    /// </summary>
    /// <param name="includeToday">Also today's deliveries: the dashboard's "Fry left to stock" shows fry from the day it
    /// arrives, while Finish stocking (DEC-76) only asks about an earlier day's.</param>
    public virtual async Task<List<OpenDeliveryDto>> GetOpenWithPlLeft(bool includeToday = false)
    {
        var today = await Farm.GetTodayAsync();
        var deliveries = await _deliveries.GetAll().AsNoTracking().Include(d => d.Hatchery)
            .Where(d => d.StockingFinishedAtUtc == null && (d.DeliveryDate < today || (includeToday && d.DeliveryDate == today)))
            .OrderBy(d => d.DeliveryDate).ToListAsync();
        var mapped = await MapAsync(deliveries);
        return mapped.Where(d => (d.IsStocked || d.Status == FryDeliveryStatus.Received) && d.PlStocked < d.PlReceived).Select(d => new OpenDeliveryDto
        {
            Id = d.Id, HatcheryBatchNumber = d.HatcheryBatchNumber, HatcheryName = d.HatcheryName, DeliveryDate = d.DeliveryDate,
            PlReceived = d.PlReceived ?? 0, PlStocked = d.PlStocked, CycleId = d.CycleId, CycleCode = d.CycleCode,
        }).ToList();
    }

    [AbpAuthorize(PermissionNames.FryDeliveries_Manage)]
    public virtual async Task<List<FryDeliveryPondOptionDto>> GetPondAllocationOptions()
    {
        var ponds = await _ponds.GetAll().AsNoTracking().Include(p => p.Prefix).Where(p => !p.IsArchived).OrderBy(p => p.PondCode).ToListAsync();
        var open = await _batches.GetAll().AsNoTracking().Where(b => b.Status != BatchStatus.Closed).Select(b => b.PondId).ToListAsync();
        var reserved = await _allocations.GetAll().AsNoTracking().Where(a => a.ReleasedAtUtc == null && a.FulfilledAtUtc == null).Select(a => new { a.PondId, a.DeliveryId }).ToListAsync();
        var deliveryIds = reserved.Select(x => x.DeliveryId).Distinct().ToList();
        var deliveries = await _deliveries.GetAll().AsNoTracking().Where(d => deliveryIds.Contains(d.Id)).Select(d => new { d.Id, d.HatcheryBatchNumber }).ToListAsync();
        return ponds.Where(p => p.Purpose == PondPurpose.GrowOut && p.ManualStatus == PondManualStatus.Active && !open.Contains(p.Id)).Select(p =>
        {
            var reservation = reserved.FirstOrDefault(x => x.PondId == p.Id);
            return new FryDeliveryPondOptionDto { Id = p.Id, PondCode = p.PondCode, Name = PondNaming.DisplayName(p.Prefix?.Name, p.Number), Status = PondDisplayStatus.Available, IsReserved = reservation != null, ReservedByDelivery = reservation == null ? null : deliveries.FirstOrDefault(d => d.Id == reservation.DeliveryId)?.HatcheryBatchNumber };
        }).ToList();
    }

    [AbpAuthorize(PermissionNames.FryDeliveries_Manage)]
    public virtual async Task<SaveFryDeliveryResult> Create(FryDeliveryEditDto input)
    {
        var hatchery = await _hatcheries.FirstOrDefaultAsync(h => h.Id == input.HatcheryId) ?? throw new UserFriendlyException("Choose a hatchery.");
        // DEC-131: logged at the gate (Received, with the count) or as an order (Ordered / In transit, with the PL ordered).
        if (input.InitialStatus is not (FryDeliveryStatus.Received or FryDeliveryStatus.Ordered or FryDeliveryStatus.InTransit))
        {
            throw new UserFriendlyException("Record fry that have arrived, or an order that is not here yet.");
        }

        var arrived = input.InitialStatus == FryDeliveryStatus.Received;
        var zone = await Farm.GetTimeZoneAsync();
        DateTime? receivedAtUtc = null;
        if (arrived)
        {
            if (!input.PlReceived.HasValue)
            {
                throw new UserFriendlyException("Enter the PL counted at the farm.");
            }

            // Without an arrival time (an entry copied from a paper sheet), the delivery date stands: now if it is today,
            // else the start of that day.
            var today = await Farm.GetTodayAsync();
            if (!input.ReceivedAt.HasValue && input.DeliveryDate > today)
            {
                throw new UserFriendlyException("The fry have arrived, so the delivery date cannot be in the future.");
            }

            receivedAtUtc = input.ReceivedAt.HasValue ? FarmClock.ToUtc(input.ReceivedAt.Value)
                : input.DeliveryDate == today || input.DeliveryDate == default ? DateTime.UtcNow
                : FarmClock.StartOfDayUtc(input.DeliveryDate, zone);
            if (receivedAtUtc > DateTime.UtcNow.AddMinutes(5))
            {
                throw new UserFriendlyException("The time the fry arrived cannot be in the future.");
            }

            input.DeliveryDate = FarmClock.LocalDate(receivedAtUtc.Value, zone);
        }
        else
        {
            if (!input.PlOrdered.HasValue)
            {
                throw new UserFriendlyException("Enter the PL ordered (PO). The farm's count is entered when the fry arrive.");
            }

            input.PlReceived = null;
        }

        await ValidateAsync(input, null);
        var delivery = new FryDelivery { HatcheryId = hatchery.Id, ReceivedAtUtc = receivedAtUtc };
        Apply(delivery, input);
        var id = await _deliveries.InsertAndGetIdAsync(delivery);
        await _changes.InsertAsync(new FryDeliveryStatusChange
        {
            DeliveryId = id, Status = input.InitialStatus, ChangedAtUtc = receivedAtUtc ?? DateTime.UtcNow, Note = arrived ? "Recorded at arrival" : "Order recorded",
        });
        if (!arrived) await SaveAllocationsAsync(id, input.PondAllocations, input.PlOrdered);
        return new SaveFryDeliveryResult { Id = id, Warnings = await WarningsAsync(input) };
    }

    /// <summary>Owner edits delivery details. Once a cycle uses it, PL received cannot drop below what was stocked and the hatchery is fixed.</summary>
    [AbpAuthorize(PermissionNames.FryDeliveries_Manage)]
    public virtual async Task<SaveFryDeliveryResult> Update(FryDeliveryEditDto input)
    {
        var delivery = await _deliveries.GetAsync(input.Id);
        Production.Concurrency.Check(delivery.RowVersion, input.RowVersion);
        var cycle = await _cycles.GetAll().AsNoTracking().FirstOrDefaultAsync(c => c.FryDeliveryId == delivery.Id);
        if (input.HatcheryId != delivery.HatcheryId)
        {
            if (cycle != null)
            {
                throw new UserFriendlyException("The hatchery cannot change once a production cycle uses this delivery.");
            }

            var hatchery = await _hatcheries.FirstOrDefaultAsync(h => h.Id == input.HatcheryId) ?? throw new UserFriendlyException("Choose a hatchery.");
            delivery.HatcheryId = hatchery.Id;
        }

        // DEC-131: the count belongs to fry that have arrived. An order keeps none; a received delivery must keep one.
        var arrived = await CurrentStatusAsync(delivery.Id) == FryDeliveryStatus.Received || cycle != null;
        if (!arrived)
        {
            input.PlReceived = null;
        }
        else
        {
            if (!input.PlReceived.HasValue)
            {
                throw new UserFriendlyException("Enter the PL counted at the farm.");
            }

            if (input.DeliveryDate > await Farm.GetTodayAsync())
            {
                throw new UserFriendlyException("The fry have arrived, so the delivery date cannot be in the future.");
            }
        }

        if (cycle != null)
        {
            var stocked = await _batches.GetAll().Where(b => b.CycleId == cycle.Id).SumAsync(b => b.PlCountStocked ?? 0);
            if (input.PlReceived < stocked)
            {
                throw new UserFriendlyException($"PL received cannot be less than the {stocked:N0} PL already stocked from this delivery.");
            }
        }

        if (delivery.IsStockingFinished && input.PlReceived != delivery.PlReceived)
        {
            throw new UserFriendlyException("PL received cannot change after Finish stocking; the delivery's counts already add up.");
        }

        await ValidateAsync(input, delivery.Id);
        Apply(delivery, input);
        if (!arrived) await SaveAllocationsAsync(delivery.Id, input.PondAllocations, input.PlOrdered);
        return new SaveFryDeliveryResult { Id = delivery.Id, Warnings = await WarningsAsync(input) };
    }

    /// <summary>
    /// Moves a delivery one step (DEC-131): In transit, Cancelled (an order that never shipped) or Rejected (fry refused at
    /// arrival). Only the next steps of FryDeliveryFlow are allowed; Cancelled and Rejected need a reason. Arrival goes
    /// through Receive, which takes the count. Not allowed once a cycle uses the delivery.
    /// </summary>
    [AbpAuthorize(PermissionNames.FryDeliveries_UpdateStatus)]
    public virtual async Task UpdateStatus(UpdateFryDeliveryStatusInput input)
    {
        var delivery = await _deliveries.GetAsync(input.DeliveryId);
        var (current, lastAt) = await NextStepCheckAsync(delivery.Id, input.Status);
        if (input.Status == FryDeliveryStatus.Received)
        {
            throw new UserFriendlyException("Use Receive fry: the count is entered when the fry arrive.");
        }

        var note = string.IsNullOrWhiteSpace(input.Note) ? null : input.Note.Trim();
        if (FryDeliveryFlow.IsEnded(input.Status) && (note == null || note.Length < 3))
        {
            throw new UserFriendlyException(input.Status == FryDeliveryStatus.Cancelled ? "Say why the order was cancelled." : "Say why the fry were rejected.");
        }

        var changedAt = await StepTimeAsync(input.ChangedAt, lastAt);
        await _changes.InsertAsync(new FryDeliveryStatusChange { DeliveryId = delivery.Id, Status = input.Status, ChangedAtUtc = changedAt, Note = note });
        if (FryDeliveryFlow.IsEnded(input.Status))
        {
            var active = await _allocations.GetAll().Where(a => a.DeliveryId == delivery.Id && a.ReleasedAtUtc == null && a.FulfilledAtUtc == null).ToListAsync();
            foreach (var allocation in active) allocation.ReleasedAtUtc = changedAt;
        }
    }

    /// <summary>
    /// The fry arrived (DEC-131): records when, the farm's count, and the papers and trip details that came with them. The
    /// delivery date becomes the arrival's farm date. Only an Ordered or In transit delivery can be received.
    /// </summary>
    [AbpAuthorize(PermissionNames.FryDeliveries_UpdateStatus)]
    public virtual async Task Receive(ReceiveFryInput input)
    {
        var delivery = await _deliveries.GetAsync(input.DeliveryId);
        var (_, lastAt) = await NextStepCheckAsync(delivery.Id, FryDeliveryStatus.Received);
        var receivedAtUtc = await StepTimeAsync(input.ReceivedAt, lastAt);
        DateTime? packedUtc = input.TimePacked.HasValue ? FarmClock.ToUtc(input.TimePacked.Value) : delivery.TimePackedUtc;
        if (packedUtc > receivedAtUtc)
        {
            throw new UserFriendlyException("The time packed cannot be after the fry arrived.");
        }

        if (input.TransportMode.HasValue && !Enum.IsDefined(input.TransportMode.Value))
        {
            throw new UserFriendlyException("Choose how the fry travelled, or leave it blank.");
        }

        var zone = await Farm.GetTimeZoneAsync();
        delivery.PlReceived = input.PlReceived;
        delivery.ReceivedAtUtc = receivedAtUtc;
        delivery.DeliveryDate = FarmClock.LocalDate(receivedAtUtc, zone);
        delivery.PlAgeDays = input.PlAgeDays ?? delivery.PlAgeDays;
        delivery.TimePackedUtc = packedUtc;
        delivery.TransportMode = input.TransportMode ?? delivery.TransportMode;
        delivery.PlHealthCertificateNo = Keep(input.PlHealthCertificateNo, delivery.PlHealthCertificateNo);
        delivery.TransportPermitNo = Keep(input.TransportPermitNo, delivery.TransportPermitNo);
        delivery.SfscNo = Keep(input.SfscNo, delivery.SfscNo);
        await _changes.InsertAsync(new FryDeliveryStatusChange
        {
            DeliveryId = delivery.Id, Status = FryDeliveryStatus.Received, ChangedAtUtc = receivedAtUtc,
            Note = string.IsNullOrWhiteSpace(input.Note) ? null : input.Note.Trim(),
        });

        static string Keep(string typed, string current) => string.IsNullOrWhiteSpace(typed) ? current : typed.Trim();
    }

    /// <summary>
    /// The Owner takes back the latest step, with a reason (DEC-131), e.g. a delivery marked Received by mistake. The step
    /// stays in the audit trail with the reason; undoing Received clears the count and arrival time. Not once stocked.
    /// </summary>
    [AbpAuthorize(PermissionNames.FryDeliveries_Manage)]
    public virtual async Task UndoLastStep(UndoDeliveryStepInput input)
    {
        var delivery = await _deliveries.GetAsync(input.DeliveryId);
        await _rowLocker.LockAsync(RowLockTarget.FryDelivery, delivery.Id);
        if (await _cycles.GetAll().AnyAsync(c => c.FryDeliveryId == delivery.Id))
        {
            throw new UserFriendlyException("This delivery is already stocked into a production cycle; its steps can no longer change.");
        }

        var reason = input.Reason?.Trim();
        if (string.IsNullOrEmpty(reason) || reason.Length < 3)
        {
            throw new UserFriendlyException("Say why the step is taken back.");
        }

        var steps = await _changes.GetAll().Where(c => c.DeliveryId == delivery.Id).OrderByDescending(c => c.ChangedAtUtc).ThenByDescending(c => c.CreationTime).ToListAsync();
        if (steps.Count < 2)
        {
            throw new UserFriendlyException("This is the delivery's first step; edit or delete the delivery instead.");
        }

        var last = steps[0];
        if (FryDeliveryFlow.IsEnded(last.Status))
        {
            var released = await _allocations.GetAll().Where(a => a.DeliveryId == delivery.Id && a.ReleasedAtUtc != null && a.FulfilledAtUtc == null).ToListAsync();
            foreach (var allocation in released)
            {
                await _rowLocker.LockAsync(RowLockTarget.Pond, allocation.PondId);
                if (await _allocations.GetAll().AnyAsync(a => a.PondId == allocation.PondId && a.DeliveryId != delivery.Id && a.ReleasedAtUtc == null && a.FulfilledAtUtc == null))
                    throw new UserFriendlyException($"Pond {allocation.PondId} has since been reserved by another delivery; this step cannot be undone.");
            }
            foreach (var allocation in released) allocation.ReleasedAtUtc = null;
        }
        var note = $"Taken back: {reason}";
        last.Note = string.IsNullOrEmpty(last.Note) ? note : $"{last.Note} · {note}";
        if (last.Note.Length > FryDeliveryStatusChange.MaxNoteLength)
        {
            last.Note = last.Note[..FryDeliveryStatusChange.MaxNoteLength];
        }

        await CurrentUnitOfWork.SaveChangesAsync();
        await _changes.DeleteAsync(last);
        if (last.Status == FryDeliveryStatus.Received)
        {
            delivery.PlReceived = null;
            delivery.ReceivedAtUtc = null;
        }
    }

    /// <summary>The delivery's current step and its time, after checking that <paramref name="next"/> may follow it.</summary>
    private async Task<(FryDeliveryStatus Current, DateTime LastAt)> NextStepCheckAsync(Guid deliveryId, FryDeliveryStatus next)
    {
        // Two people pressing the same step at once run one after the other: the second then sees the first's step (DEC-133).
        await _rowLocker.LockAsync(RowLockTarget.FryDelivery, deliveryId);
        if (!Enum.IsDefined(next))
        {
            throw new UserFriendlyException("Choose the next step.");
        }

        if (await _cycles.GetAll().AnyAsync(c => c.FryDeliveryId == deliveryId))
        {
            throw new UserFriendlyException("This delivery is already stocked into a production cycle; its status can no longer change.");
        }

        var last = await _changes.GetAll().Where(c => c.DeliveryId == deliveryId).OrderByDescending(c => c.ChangedAtUtc).ThenByDescending(c => c.CreationTime)
            .Select(c => new { c.Status, c.ChangedAtUtc }).FirstOrDefaultAsync();
        var current = last?.Status ?? FryDeliveryStatus.Ordered;
        if (!FryDeliveryFlow.Next(current).Contains(next))
        {
            throw new UserFriendlyException(FryDeliveryFlow.IsEnded(current)
                ? $"The delivery is {Label(current)}; it takes no further steps."
                : $"A delivery that is {Label(current)} cannot become {Label(next)}.");
        }

        return (current, last?.ChangedAtUtc ?? DateTime.MinValue);
    }

    /// <summary>When a step happened: now by default, never in the future and never before the step it follows.</summary>
    private static Task<DateTime> StepTimeAsync(DateTime? typed, DateTime previousUtc)
    {
        var at = typed.HasValue ? FarmClock.ToUtc(typed.Value) : DateTime.UtcNow;
        if (at > DateTime.UtcNow.AddMinutes(5))
        {
            throw new UserFriendlyException("The time cannot be in the future.");
        }

        if (at < previousUtc)
        {
            throw new UserFriendlyException("The time cannot be before the delivery's previous step.");
        }

        return Task.FromResult(at);
    }

    public static string Label(FryDeliveryStatus status) => status switch
    {
        FryDeliveryStatus.InTransit => "In transit",
        _ => status.ToString(),
    };

    internal async Task<FryDeliveryStatus?> CurrentStatusAsync(Guid deliveryId) =>
        await _changes.GetAll().Where(c => c.DeliveryId == deliveryId)
            .OrderByDescending(c => c.ChangedAtUtc).ThenByDescending(c => c.CreationTime)
            .Select(c => (FryDeliveryStatus?)c.Status).FirstOrDefaultAsync();

    private async Task SaveAllocationsAsync(Guid deliveryId, List<FryDeliveryPondAllocationInput> input, long? plOrdered)
    {
        var requested = input ?? new List<FryDeliveryPondAllocationInput>();
        if (requested.Select(x => x.PondId).Distinct().Count() != requested.Count) throw new UserFriendlyException("Choose each destination pond only once.");
        if (requested.Sum(x => x.PlannedPlCount) > (plOrdered ?? 0)) throw new UserFriendlyException("The total planned PL allocation cannot exceed PL ordered.");
        var existing = await _allocations.GetAll().Where(a => a.DeliveryId == deliveryId && a.ReleasedAtUtc == null && a.FulfilledAtUtc == null).ToListAsync();
        var pondIds = existing.Select(a => a.PondId).Concat(requested.Select(x => x.PondId)).Distinct().OrderBy(x => x).ToList();
        foreach (var pondId in pondIds) await _rowLocker.LockAsync(RowLockTarget.Pond, pondId);
        var requestedIds = requested.Select(x => x.PondId).ToList();
        if (await _allocations.GetAll().AnyAsync(a => requestedIds.Contains(a.PondId) && a.DeliveryId != deliveryId && a.ReleasedAtUtc == null && a.FulfilledAtUtc == null))
            throw new UserFriendlyException("One or more selected ponds are already reserved for another fry delivery.");
        var ponds = await _ponds.GetAll().Where(p => requestedIds.Contains(p.Id)).ToListAsync();
        if (ponds.Count != requested.Count) throw new UserFriendlyException("One or more selected ponds could not be found.");
        foreach (var pond in ponds)
            if (pond.IsArchived || pond.Purpose != PondPurpose.GrowOut || pond.ManualStatus != PondManualStatus.Active || await _batches.GetAll().AnyAsync(b => b.PondId == pond.Id && b.Status != BatchStatus.Closed))
                throw new UserFriendlyException($"Pond {pond.PondCode} is not eligible for a fry-delivery reservation.");
        foreach (var old in existing.Where(a => !requestedIds.Contains(a.PondId))) old.ReleasedAtUtc = DateTime.UtcNow;
        foreach (var item in requested)
        {
            var old = existing.FirstOrDefault(a => a.PondId == item.PondId);
            if (old != null) old.PlannedPlCount = item.PlannedPlCount;
            else await _allocations.InsertAsync(new FryDeliveryPondAllocation { DeliveryId = deliveryId, PondId = item.PondId, PlannedPlCount = item.PlannedPlCount });
        }
    }

    private async Task ValidateAsync(FryDeliveryEditDto input, Guid? exceptId)
    {
        var number = input.HatcheryBatchNumber.Trim();
        if (await _deliveries.GetAll().AnyAsync(d => d.HatcheryId == input.HatcheryId && d.HatcheryBatchNumber == number && d.Id != exceptId))
        {
            throw new UserFriendlyException($"Batch number '{number}' is already recorded for this hatchery.");
        }

        if (input.DeliveryDate > (await Farm.GetTodayAsync()).AddDays(60))
        {
            throw new UserFriendlyException("The delivery date is too far in the future.");
        }

        if (input.TransportMode.HasValue && !Enum.IsDefined(input.TransportMode.Value))
        {
            throw new UserFriendlyException("Choose how the fry travelled, or leave it blank.");
        }

        // DEC-128: packed at the hatchery, so not after the day the fry arrived and not in the future.
        if (input.TimePacked.HasValue)
        {
            var packed = FarmClock.ToUtc(input.TimePacked.Value);
            var endOfDelivery = FarmClock.StartOfDayUtc(input.DeliveryDate.AddDays(1), await Farm.GetTimeZoneAsync());
            if (packed > DateTime.UtcNow.AddMinutes(5) || packed >= endOfDelivery)
            {
                throw new UserFriendlyException("The time packed cannot be after the delivery day or in the future. Check the date, or leave it blank.");
            }
        }
    }

    private async Task<List<WarningDto>> WarningsAsync(FryDeliveryEditDto input)
    {
        var list = new List<WarningDto>();
        var min = await _standards.GetAsync(ReferenceData.FarmThresholds.PlAgeMin);
        var max = await _standards.GetAsync(ReferenceData.FarmThresholds.PlAgeMax);
        if (input.PlAgeDays.HasValue && (input.PlAgeDays < min || input.PlAgeDays > max))
        {
            list.Add(new WarningDto { Kind = "PlAge", Message = $"PL{input.PlAgeDays} is outside the farm's PL{min:0}–PL{max:0} range for stocking (Farm Standards)." });
        }

        return list;
    }

    private static void Apply(FryDelivery d, FryDeliveryEditDto input)
    {
        d.HatcheryBatchNumber = input.HatcheryBatchNumber.Trim();
        d.DeliveryDate = input.DeliveryDate;
        d.PlAgeDays = input.PlAgeDays;
        d.PlReceived = input.PlReceived;
        d.PlOrdered = input.PlOrdered;
        d.CostPhp = input.CostPhp;
        d.Notes = string.IsNullOrWhiteSpace(input.Notes) ? null : input.Notes.Trim();
        d.PlHealthCertificateNo = string.IsNullOrWhiteSpace(input.PlHealthCertificateNo) ? null : input.PlHealthCertificateNo.Trim();
        // The transport permit and the time packed are no longer asked for on the screens (capstone consultation, 21 Nov 2026).
        // A value is set only when one is sent, so an edit from the screens does not clear what was recorded earlier.
        if (!string.IsNullOrWhiteSpace(input.TransportPermitNo))
        {
            d.TransportPermitNo = input.TransportPermitNo.Trim();
        }

        d.SfscNo = string.IsNullOrWhiteSpace(input.SfscNo) ? null : input.SfscNo.Trim();
        d.TransportMode = input.TransportMode;
        if (input.TimePacked.HasValue)
        {
            d.TimePackedUtc = FarmClock.ToUtc(input.TimePacked.Value);
        }
    }

    private async Task<List<FryDeliveryDto>> MapAsync(List<FryDelivery> deliveries)
    {
        var ids = deliveries.Select(d => d.Id).ToList();
        var changes = await _changes.GetAll().AsNoTracking().Where(c => ids.Contains(c.DeliveryId))
            .Select(c => new { c.DeliveryId, c.Status, c.ChangedAtUtc, c.CreationTime }).ToListAsync();
        var cycles = await _cycles.GetAll().AsNoTracking().Where(c => ids.Contains(c.FryDeliveryId))
            .Select(c => new { c.Id, c.FryDeliveryId, c.CycleCode }).ToListAsync();
        var cycleIds = cycles.Select(c => c.Id).ToList();
        var stocked = await _batches.GetAll().Where(b => cycleIds.Contains(b.CycleId))
            .GroupBy(b => b.CycleId).Select(g => new { CycleId = g.Key, Pl = g.Sum(b => b.PlCountStocked ?? 0) }).ToListAsync();
        var shortfalls = await _shortfalls.GetAll().Where(s => ids.Contains(s.DeliveryId))
            .GroupBy(s => s.DeliveryId).Select(g => new { DeliveryId = g.Key, Pl = g.Sum(s => s.Count) }).ToListAsync();
        return deliveries.Select(d =>
        {
            var latest = changes.Where(c => c.DeliveryId == d.Id).OrderByDescending(c => c.ChangedAtUtc).ThenByDescending(c => c.CreationTime).FirstOrDefault();
            var cycle = cycles.FirstOrDefault(c => c.FryDeliveryId == d.Id);
            var pl = cycle == null ? 0 : stocked.FirstOrDefault(s => s.CycleId == cycle.Id)?.Pl ?? 0;
            return new FryDeliveryDto
            {
                Id = d.Id, HatcheryId = d.HatcheryId, HatcheryName = d.Hatchery?.Name, HatcheryShortCode = d.Hatchery?.ShortCode,
                HatcheryBatchNumber = d.HatcheryBatchNumber, DeliveryDate = d.DeliveryDate, PlAgeDays = d.PlAgeDays, PlReceived = d.PlReceived, PlOrdered = d.PlOrdered,
                ReceivedAtUtc = d.ReceivedAtUtc,
                CostPhp = d.CostPhp, Notes = d.Notes, Status = latest?.Status ?? FryDeliveryStatus.Ordered, StatusChangedAtUtc = latest?.ChangedAtUtc ?? d.CreationTime,
                PlHealthCertificateNo = d.PlHealthCertificateNo, TransportPermitNo = d.TransportPermitNo, SfscNo = d.SfscNo,
                TransportMode = d.TransportMode, TimePackedUtc = d.TimePackedUtc,
                IsStockingFinished = d.IsStockingFinished, StockingFinishedAtUtc = d.StockingFinishedAtUtc,
                PlNotStocked = shortfalls.FirstOrDefault(s => s.DeliveryId == d.Id)?.Pl ?? 0,
                IsStocked = cycle != null, CycleId = cycle?.Id, CycleCode = cycle?.CycleCode, PlStocked = pl,
                PlLeft = (d.PlReceived ?? 0) - pl - (shortfalls.FirstOrDefault(s => s.DeliveryId == d.Id)?.Pl ?? 0),
                RowVersion = Production.Concurrency.Encode(d.RowVersion),
            };
        }).ToList();
    }

    private static void Copy(FryDeliveryDto from, FryDeliveryDto to)
    {
        foreach (var p in typeof(FryDeliveryDto).GetProperties())
        {
            p.SetValue(to, p.GetValue(from));
        }
    }
}
