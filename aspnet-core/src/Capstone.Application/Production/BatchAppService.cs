using Capstone.Common;
using Abp.Application.Services.Dto;
using Abp.Authorization;
using Abp.Domain.Repositories;
using Abp.Runtime.Session;
using Abp.UI;
using Capstone.Authorization;
using Capstone.Domain;
using Capstone.Harvests;
using Capstone.ReferenceData;
using Capstone.Production.Dto;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace Capstone.Production;

/// <summary>Batches: details and indicators, historical incident compatibility, and Close Batch (Ref 5.5, AC-16).</summary>
[AbpAuthorize(PermissionNames.Production)]
public class BatchAppService : CapstoneAppServiceBase
{
    private readonly IRepository<PondBatch, Guid> _batches;
    private readonly IRepository<BatchFailure, Guid> _failures;
    private readonly IRepository<ProductionLog, Guid> _logs;
    private readonly IRepository<Harvest, Guid> _harvests;
    private readonly BatchDataLoader _loader;
    private readonly DailyLogStatusService _daily;
    private readonly IRepository<ReopenEvent, Guid> _reopenings;
    private readonly IRepository<ProductionCycle, Guid> _cycles;
    private readonly TreatmentWithdrawal _withdrawal;
    private readonly IRepository<Sales.SaleLine, Guid> _saleLines;
    private readonly IRepository<Sales.Sale, Guid> _sales;
    private readonly IRepository<Inventory.StockMovement, Guid> _movements;
    private readonly Authorization.Roles.RoleManager _roleManager;
    private readonly FarmStandardsProvider _standards;

    public BatchAppService(IRepository<PondBatch, Guid> batches, IRepository<BatchFailure, Guid> failures, IRepository<ProductionLog, Guid> logs,
        IRepository<Harvest, Guid> harvests, BatchDataLoader loader, DailyLogStatusService daily, IRepository<ReopenEvent, Guid> reopenings,
        IRepository<ProductionCycle, Guid> cycles, TreatmentWithdrawal withdrawal, IRepository<Sales.SaleLine, Guid> saleLines, IRepository<Sales.Sale, Guid> sales,
        IRepository<Inventory.StockMovement, Guid> movements, Authorization.Roles.RoleManager roleManager, FarmStandardsProvider standards)
    {
        _roleManager = roleManager;
        _standards = standards;
        _movements = movements;
        _saleLines = saleLines;
        _sales = sales;
        _reopenings = reopenings;
        _cycles = cycles;
        _withdrawal = withdrawal;
        _daily = daily;
        _batches = batches;
        _failures = failures;
        _logs = logs;
        _harvests = harvests;
        _loader = loader;
    }

    internal static BatchListDto MapList(PondBatch b, string cycleCode, BatchIndicators ind) => new()
    {
        Id = b.Id, BatchCode = b.BatchCode, Letter = b.Letter, CycleId = b.CycleId, CycleCode = cycleCode, PondId = b.PondId, PondCode = b.Pond?.PondCode,
        Status = b.Status == BatchStatus.Failed ? BatchStatus.Harvested : b.Status, StockingDate = b.StockingDate, PlCountStocked = b.PlCountStocked,
        Doc = b.Status == BatchStatus.Stocked ? ind.Doc : null,
        CurrentAbwG = b.Status == BatchStatus.Closed ? b.FinalAbwG : ind.CurrentAbwG,
        FcrToDate = b.Status == BatchStatus.Closed ? b.FinalFcr : ind.FcrToDate,
        EstimatedSurvivalPct = b.Status == BatchStatus.Closed ? b.SurvivalRatePct : ind.EstimatedSurvivalPct,
        TechnicianUserIds = b.Technicians.Select(t => t.UserId).ToList(), CoverUserId = b.CoverUserId, CoverUntil = b.CoverUntil,
    };

    /// <summary>Fills the technician's and the cover's names, and whether the signed-in user looks after each batch today (DEC-127).</summary>
    private async Task FillPeopleAsync(IReadOnlyCollection<BatchListDto> list)
    {
        if (list.Count == 0)
        {
            return;
        }

        var names = await GetUserNamesAsync(list.SelectMany(x => x.TechnicianUserIds.Select(i => (long?)i).Append(x.CoverUserId)));
        var me = AbpSession.UserId;
        var today = await Farm.GetTodayAsync();
        foreach (var x in list)
        {
            x.TechnicianNames = x.TechnicianUserIds.Select(i => NameOf(names, i)).Where(n => n != null).OrderBy(n => n).ToList();
            x.TechnicianName = PeopleText.Join(x.TechnicianNames);
            x.CoverName = NameOf(names, x.CoverUserId);
            var batch = new PondBatch { Technicians = x.TechnicianUserIds.Select(i => new BatchTechnician { UserId = i }).ToList(), CoverUserId = x.CoverUserId, CoverUntil = x.CoverUntil };
            x.CoverActive = batch.IsCoveredOn(today);
            x.LookingAfterName = x.CoverActive ? x.CoverName : x.TechnicianName;
            x.IsMine = batch.IsLookedAfterBy(me, today);
        }
    }

    /// <summary>Batches matching a typed search on batch code, pond code or cycle code (blank matches all).</summary>
    private static IQueryable<PondBatch> Matching(IQueryable<PondBatch> query, string search)
    {
        var s = search?.Trim();
        return string.IsNullOrEmpty(s) ? query : query.Where(b => b.BatchCode.Contains(s) || b.Pond.PondCode.Contains(s) || b.Cycle.CycleCode.Contains(s));
    }

    public virtual async Task<List<BatchListDto>> GetAll(GetBatchesInput input)
    {
        var batches = await Matching(_batches.GetAll().AsNoTracking().Include(b => b.Pond).Include(b => b.Cycle).Include(b => b.Technicians), input.Search)
            .Where(b => !input.CycleId.HasValue || b.CycleId == input.CycleId)
            .Where(b => !input.PondId.HasValue || b.PondId == input.PondId)
            .Where(b => !input.Status.HasValue || (input.Status == BatchStatus.Harvested ? b.Status == BatchStatus.Harvested || b.Status == BatchStatus.Failed : b.Status == input.Status))
            .Where(b => !input.OpenOnly || b.Status != BatchStatus.Closed)
            .OrderBy(b => b.Status == BatchStatus.Closed).ThenBy(b => b.Pond.PondCode).ThenByDescending(b => b.StockedAtUtc)
            .ToListAsync();
        var facts = await _loader.LoadAsync(batches.Select(b => b.Id).ToList(), await Farm.GetTimeZoneAsync());
        var today = await Farm.GetTodayAsync();
        var list = batches.Select(b => MapList(b, b.Cycle?.CycleCode, IndicatorCalculator.Compute(facts.TryGetValue(b.Id, out var f) ? f : new BatchFacts(), today))).ToList();
        await FillPeopleAsync(list);
        return list;
    }

    private static readonly string[] BatchSortKeys = { "default", "batchCode", "pondCode", "cycleCode", "status", "stockingDate", "plCountStocked" };

    /// <summary>
    /// One page of batches (AC-27). Indicators are worked out only for the rows on the page. Sort keys: default (open batches
    /// first, by pond, newest stocking first), batchCode, pondCode, cycleCode, status, stockingDate, plCountStocked.
    /// </summary>
    public virtual async Task<PagedResultDto<BatchListDto>> GetPage(GetBatchPageInput input)
    {
        var query = Matching(_batches.GetAll().AsNoTracking().Include(b => b.Pond).Include(b => b.Cycle).Include(b => b.Technicians), input.Search)
            .Where(b => !input.CycleId.HasValue || b.CycleId == input.CycleId)
            .Where(b => !input.PondId.HasValue || b.PondId == input.PondId)
            .Where(b => !input.Status.HasValue || b.Status == input.Status)
            .Where(b => !input.OpenOnly || b.Status != BatchStatus.Closed);
        var total = await query.CountAsync();
        var sort = SortSpec.Parse(input.Sorting, BatchSortKeys, "default", false);
        var ordered = sort.Key switch
        {
            "batchCode" => sort.Apply(query, b => b.BatchCode),
            "pondCode" => sort.Apply(query, b => b.Pond.PondCode).ThenBy(b => b.BatchCode),
            "cycleCode" => sort.Apply(query, b => b.Cycle.CycleCode).ThenBy(b => b.BatchCode),
            "status" => sort.Apply(query, b => b.Status).ThenBy(b => b.BatchCode),
            "stockingDate" => sort.Apply(query, b => b.StockingDate).ThenBy(b => b.BatchCode),
            "plCountStocked" => sort.Apply(query, b => b.PlCountStocked).ThenBy(b => b.BatchCode),
            _ => query.OrderBy(b => b.Status == BatchStatus.Closed).ThenBy(b => b.Pond.PondCode).ThenByDescending(b => b.StockedAtUtc),
        };
        var batches = await ordered.Skip(input.SkipCount).Take(input.MaxResultCount).ToListAsync();
        var facts = await _loader.LoadAsync(batches.Select(b => b.Id).ToList(), await Farm.GetTimeZoneAsync());
        var today = await Farm.GetTodayAsync();
        var items = batches.Select(b => MapList(b, b.Cycle?.CycleCode, IndicatorCalculator.Compute(facts.TryGetValue(b.Id, out var f) ? f : new BatchFacts(), today))).ToList();
        await FillPeopleAsync(items);
        return new PagedResultDto<BatchListDto>(total, items);
    }

    /// <summary>Counts per status for the list's status chips; follows the search and "open only" but not the chosen status.</summary>
    public virtual async Task<List<StatusCountDto>> GetStatusCounts(GetBatchStatusCountsInput input)
    {
        var query = Matching(_batches.GetAll().AsNoTracking(), input.Search).Where(b => !input.OpenOnly || b.Status != BatchStatus.Closed);
        return await query.GroupBy(b => b.Status == BatchStatus.Failed ? BatchStatus.Harvested : b.Status).Select(g => new StatusCountDto { Status = (int)g.Key, Count = g.Count() }).ToListAsync();
    }

    /// <summary>
    /// The batch's figures as they stood at the end of one farm day (DEC-101): the same formulas on only the records up to
    /// that day. A day after today is worked out for today.
    /// </summary>
    public virtual async Task<IndicatorsDto> GetIndicatorsOn(Guid id, DateOnly date)
    {
        var b = await _batches.GetAll().AsNoTracking().FirstOrDefaultAsync(x => x.Id == id) ?? throw new UserFriendlyException("Batch not found.");
        var today = await Farm.GetTodayAsync();
        var day = date > today ? today : date;
        var facts = (await _loader.LoadAsync(b.Id, await Farm.GetTimeZoneAsync())).AsOf(day);
        var dto = IndicatorsDto.From(IndicatorCalculator.Compute(facts, day));
        dto.AsOf = day;
        return dto;
    }

    public virtual async Task<BatchDetailDto> Get(Guid id)
    {
        var b = await _batches.GetAll().AsNoTracking().Include(x => x.Technicians).Include(x => x.Pond).Include(x => x.Cycle).ThenInclude(c => c.FryDelivery).ThenInclude(d => d.Hatchery)
                    .FirstOrDefaultAsync(x => x.Id == id) ?? throw new UserFriendlyException("Batch not found.");
        var zone = await Farm.GetTimeZoneAsync();
        var facts = await _loader.LoadAsync(b.Id, zone);
        var today = await Farm.GetTodayAsync();
        var ind = IndicatorCalculator.Compute(facts, today);
        var harvestDocTarget = (int)await _standards.GetAsync(FarmThresholds.HarvestReadyFromDoc);
        var harvestAbwTarget = await _standards.GetAsync(FarmThresholds.HarvestReadyAtAbw);
        var latestGrowthSample = facts.GrowthSamples.OrderByDescending(g => g.ObservedAtUtc).FirstOrDefault();
        var sampleIsRecent = latestGrowthSample != null && latestGrowthSample.Date <= today && latestGrowthSample.Date >= today.AddDays(-7);
        var harvestReadinessReached = b.Status == BatchStatus.Stocked && ind.Doc.HasValue && ind.Doc.Value >= harvestDocTarget && sampleIsRecent && latestGrowthSample.AbwG >= harvestAbwTarget;
        var counts = await _logs.GetAll().Where(l => l.BatchId == id).GroupBy(l => l.LogType).Select(g => new { g.Key, N = g.Count() }).ToListAsync();
        var hasFinal = await _harvests.GetAll().Where(h => h.BatchId == id).AnyAsync(Harvest.EmptiesPondExpression);
        var hasHarvest = await _harvests.GetAll().AnyAsync(h => h.BatchId == id);
        var failure = await _failures.GetAll().AsNoTracking().FirstOrDefaultAsync(f => f.BatchId == id);
        var names = await GetUserNamesAsync(new[] { b.ClosedByUserId });
        var isOwner = await IsGrantedAsync(PermissionNames.Production_Manage);
        var canHarvest = await IsGrantedAsync(PermissionNames.Harvests_Create);
        var delivery = b.Cycle?.FryDelivery;

        var list = MapList(b, b.Cycle?.CycleCode, ind);
        var dto = new BatchDetailDto
        {
            Id = list.Id, BatchCode = list.BatchCode, Letter = list.Letter, CycleId = list.CycleId, CycleCode = list.CycleCode, PondId = list.PondId, PondCode = list.PondCode,
            Status = list.Status, StockingDate = list.StockingDate, PlCountStocked = list.PlCountStocked, Doc = list.Doc, CurrentAbwG = list.CurrentAbwG,
            FcrToDate = list.FcrToDate, EstimatedSurvivalPct = list.EstimatedSurvivalPct,
            PondAreaM2AtStocking = b.PondAreaM2AtStocking, StockedAtUtc = b.StockedAtUtc, TransportMode = delivery?.TransportMode, TimePackedUtc = delivery?.TimePackedUtc,
            AcclimationMinutes = b.AcclimationMinutes, InitialSurvivalEstimatePct = b.InitialSurvivalEstimatePct,
            FryDeliveryId = b.Cycle?.FryDeliveryId ?? Guid.Empty, HatcheryName = delivery?.Hatchery?.Name, HatcheryBatchNumber = delivery?.HatcheryBatchNumber,
            PlAgeDays = delivery?.PlAgeDays,
            HatcheryCertificationStatusAtStocking = b.HatcheryCertificationStatusAtStocking, StockingDensityPerM2 = b.StockingDensityPerM2,
            DeadAtStocking = b.DeadAtStocking, PlHealthCertificateNo = delivery?.PlHealthCertificateNo, SfscNo = delivery?.SfscNo,
            EarliestSafeHarvestDate = await _withdrawal.EarliestSafeHarvestDateAsync(b.Id, zone),
            HarvestReadinessReached = harvestReadinessReached,
            HarvestReadinessSampleIsRecent = sampleIsRecent,
            HarvestReadinessDocTarget = harvestDocTarget,
            HarvestReadinessAbwTargetG = harvestAbwTarget,
            HarvestReadinessSampleDate = latestGrowthSample?.Date,
            Reopenings = await ReopeningsAsync(b.Id),
            FarmingSystemAtStocking = b.FarmingSystemAtStocking, ConstructionTypeAtStocking = b.ConstructionTypeAtStocking, DensityFlag = b.DensityFlag,
            FailureReason = failure?.Reason, FailureDate = failure?.FailedOn, EstimatedLossPhp = failure?.EstimatedLossPhp,
            FinalAbwG = b.FinalAbwG, FinalFcr = b.FinalFcr, SurvivalRatePct = b.SurvivalRatePct, TotalHarvestKg = b.TotalHarvestKg, TotalFeedKg = b.TotalFeedKg,
            CultureDays = b.CultureDays, ClosedAtUtc = b.ClosedAtUtc, ClosedBy = NameOf(names, b.ClosedByUserId), RowVersion = Concurrency.Encode(b.RowVersion),
            Indicators = IndicatorsDto.From(ind),
            LogCounts = counts.ToDictionary(c => c.Key.ToString(), c => c.N),
            HasFinalHarvest = hasFinal,
            HasRecords = counts.Count > 0 || hasHarvest,
            AllowedLogTypes = Enum.GetValues<LogType>().Where(b.AllowsNewLog).Select(t => t.ToString()).ToList(),
            IsReadOnly = b.Status == BatchStatus.Closed,
            TechnicianUserIds = b.Technicians.Select(t => t.UserId).ToList(), CoverUserId = b.CoverUserId, CoverUntil = b.CoverUntil,
        };
        await FillPeopleAsync(new BatchListDto[] { dto });

        dto.CanClose = isOwner && (b.Status == BatchStatus.Harvested || b.Status == BatchStatus.Failed);
        dto.CanAddHarvest = canHarvest && (b.Status == BatchStatus.Stocked || b.Status == BatchStatus.Failed);
        if (b.Status == BatchStatus.Closed && isOwner)
        {
            dto.ReopenBlockedReason = await ReopenBlockedReasonAsync(b);
            dto.CanReopen = dto.ReopenBlockedReason == null;
        }

        return dto;
    }

    /// <summary>
    /// Who looks after the batch (DEC-127): its technician, and someone covering until a day, or open-ended. Only sets
    /// defaults and names; nothing is blocked by it. Owner only. A closed batch keeps the names it had.
    /// </summary>
    [AbpAuthorize(PermissionNames.Production_Manage)]
    public virtual async Task SetTechnician(SetBatchTechnicianInput input)
    {
        var batch = await _batches.GetAll().Include(b => b.Technicians).FirstOrDefaultAsync(b => b.Id == input.Id) ?? throw new UserFriendlyException("Batch not found.");
        if (batch.Status == BatchStatus.Closed)
        {
            throw new UserFriendlyException("This batch is closed; reopen it to change who looks after it.");
        }

        var technicians = (input.TechnicianUserIds ?? new()).Distinct().ToList();
        if (technicians.Count > PondBatch.MaxTechnicians)
        {
            throw new UserFriendlyException($"Name up to {PondBatch.MaxTechnicians} people for one batch.");
        }

        if (input.CoverUserId.HasValue && technicians.Count == 0)
        {
            throw new UserFriendlyException("Choose who looks after the batch first; a cover stands in for them.");
        }

        if (input.CoverUserId.HasValue && technicians.Contains(input.CoverUserId.Value))
        {
            throw new UserFriendlyException("The cover must be someone who does not already look after the batch.");
        }

        var today = await Farm.GetTodayAsync();
        if (input.CoverUntil.HasValue && input.CoverUntil.Value < today)
        {
            throw new UserFriendlyException("The cover's last day cannot be in the past.");
        }

        var ids = technicians.Concat(input.CoverUserId.HasValue ? new[] { input.CoverUserId.Value } : Array.Empty<long>()).ToList();
        var active = await UserRepository.GetAll().AsNoTracking().Where(u => ids.Contains(u.Id) && u.IsActive).Select(u => u.Id).ToListAsync();
        if (active.Count != ids.Distinct().Count())
        {
            throw new UserFriendlyException("Choose an active account of this farm.");
        }

        batch.Technicians.RemoveAll(t => !technicians.Contains(t.UserId));
        foreach (var id in technicians.Where(id => batch.Technicians.All(t => t.UserId != id)))
        {
            batch.Technicians.Add(new BatchTechnician { BatchId = batch.Id, UserId = id });
        }

        batch.CoverUserId = input.CoverUserId;
        batch.CoverUntil = input.CoverUserId.HasValue ? input.CoverUntil : null;
    }

    /// <summary>The farm's active accounts that can look after a batch (DEC-127), Technicians first.</summary>
    [AbpAuthorize(PermissionNames.Production_Manage)]
    public virtual async Task<List<TechnicianOptionDto>> GetTechnicianOptions()
    {
        var users = await UserRepository.GetAll().AsNoTracking().Include(u => u.Roles).Where(u => u.IsActive).ToListAsync();
        var roles = await _roleManager.Roles.AsNoTracking().ToDictionaryAsync(r => r.Id, r => new { r.Name, r.DisplayName });
        return users
            .Select(u => (u, role: u.Roles.Select(r => roles.GetValueOrDefault(r.RoleId)).FirstOrDefault(r => r != null)))
            .OrderBy(x => x.role?.Name != Authorization.Roles.StaticRoleNames.Tenants.FarmTechnician)
            .ThenBy(x => x.u.Name)
            .Select(x => new TechnicianOptionDto
            {
                Id = x.u.Id,
                Name = $"{x.u.Name} {x.u.Surname}".Trim(),
                RoleName = x.role?.DisplayName ?? x.role?.Name,
                IsTechnician = x.role?.Name == Authorization.Roles.StaticRoleNames.Tenants.FarmTechnician,
            })
            .ToList();
    }

    private async Task<string> ReopenBlockedReasonAsync(PondBatch b)
    {
        if (b.Cycle?.Status == CycleStatus.Closed || await _cycles.GetAll().AnyAsync(c => c.Id == b.CycleId && c.Status == CycleStatus.Closed))
        {
            return $"Cycle {b.Cycle?.CycleCode} is Closed. Reopen the cycle first.";
        }

        var other = await _batches.GetAll().AsNoTracking().Where(x => x.PondId == b.PondId && x.Id != b.Id && x.Status != BatchStatus.Closed)
            .Select(x => x.BatchCode).FirstOrDefaultAsync();
        return other != null ? $"Pond {b.Pond?.PondCode} already has open batch {other}; this batch cannot be reopened while it is open." : null;
    }

    private async Task<List<ReopenEventDto>> ReopeningsAsync(Guid batchId)
    {
        var list = await _reopenings.GetAll().AsNoTracking().Where(r => r.EntityType == ReopenedEntityType.Batch && r.EntityId == batchId)
            .OrderByDescending(r => r.ReopenedAtUtc).ToListAsync();
        var names = await GetUserNamesAsync(list.Select(r => (long?)r.ReopenedByUserId));
        return list.Select(r => new ReopenEventDto { ReopenedAtUtc = r.ReopenedAtUtc, ReopenedBy = NameOf(names, r.ReopenedByUserId), Reason = r.Reason }).ToList();
    }

    /// <summary>
    /// Owner reopens a Closed batch with a reason (DEC-64). It returns to Failed when it has a failure record, otherwise to
    /// Harvested; its stored final indicators are cleared and recomputed when it is closed again. The cycle must be open.
    /// </summary>
    [AbpAuthorize(PermissionNames.Production_Manage)]
    public virtual async Task Reopen(ReopenInput input)
    {
        var batch = await _batches.GetAll().Include(b => b.Pond).Include(b => b.Cycle).FirstOrDefaultAsync(b => b.Id == input.Id)
                    ?? throw new UserFriendlyException("Batch not found.");
        Concurrency.Check(batch.RowVersion, input.RowVersion);
        if (batch.Status != BatchStatus.Closed)
        {
            throw new UserFriendlyException("Only a Closed batch can be reopened.");
        }

        var reason = input.Reason?.Trim();
        if (string.IsNullOrWhiteSpace(reason))
        {
            throw new UserFriendlyException("Give the reason for reopening.");
        }

        if (await ReopenBlockedReasonAsync(batch) is { } blocked)
        {
            throw new UserFriendlyException(blocked);
        }

        batch.Status = await _failures.GetAll().AnyAsync(f => f.BatchId == batch.Id) ? BatchStatus.Failed : BatchStatus.Harvested;
        batch.ClosedAtUtc = null;
        batch.ClosedByUserId = null;
        batch.FinalAbwG = null;
        batch.FinalFcr = null;
        batch.SurvivalRatePct = null;
        batch.TotalHarvestKg = null;
        batch.TotalFeedKg = null;
        batch.CultureDays = null;
        await _reopenings.InsertAsync(new ReopenEvent
        {
            EntityType = ReopenedEntityType.Batch, EntityId = batch.Id, ReopenedAtUtc = DateTime.UtcNow, ReopenedByUserId = AbpSession.GetUserId(), Reason = reason,
        });
    }

    /// <summary>Retained for API compatibility; new production endings must be recorded as Emergency Harvests.</summary>
    [AbpAuthorize(PermissionNames.Production_Manage)]
    public virtual Task DeclareFailure(FailureInput input)
    {
        throw new UserFriendlyException("Declaring a batch failure is no longer supported. Record an Emergency harvest and its outcome instead.");
    }

    /// <summary>
    /// What Close Batch lists before the confirmation (DEC-50): feeding slots (each feeding in the farm's schedule, DEC-61) and water days left blank between
    /// stocking and the end of culture (Total harvest, failure, or today).
    /// </summary>
    public virtual async Task<CloseCheckDto> GetCloseCheck(Guid id)
    {
        var batch = await _batches.GetAll().AsNoTracking().FirstOrDefaultAsync(b => b.Id == id) ?? throw new UserFriendlyException("Batch not found.");
        var result = new CloseCheckDto { BatchId = id };
        await FillFlaggedLotsAsync(result, id);
        var fry = await _batches.GetAll().AsNoTracking().Where(b => b.Id == id).Select(b => new { b.Cycle.FryDelivery.SfscNo, b.Cycle.FryDelivery.HatcheryBatchNumber }).FirstOrDefaultAsync();
        result.SfscMissing = fry != null && string.IsNullOrWhiteSpace(fry.SfscNo);
        result.FryDeliveryBatchNumber = fry?.HatcheryBatchNumber;
        if (!batch.StockingDate.HasValue)
        {
            await FillUnaccountedAsync(result, id);
            return result;
        }

        var zone = await Farm.GetTimeZoneAsync();
        var until = await _daily.ExpectedUntilAsync(batch, FarmClock.Today(zone), zone);
        if (until < batch.StockingDate.Value)
        {
            return result;
        }

        var days = (await _daily.LoadAsync(new[] { batch }, batch.StockingDate.Value, until, zone, (await Farm.GetFeedingTimesAsync()).Count, await Farm.GetWaterQualityDailyAsync()))[batch.Id];
        result.From = batch.StockingDate;
        result.To = until;
        result.BlankFeedingSlots = days.Sum(d => d.BlankFeedings);
        result.NotFedSlots = days.Sum(d => d.NotFedFeedings);
        result.BlankWaterDays = days.Count(d => d.Water == DailyCellStatus.Blank);
        var blanks = days.Where(d => d.HasBlank).ToList();
        result.BlankDaysTotal = blanks.Count;
        await FillUnaccountedAsync(result, batch.Id);
        result.BlankDays = blanks.Take(60).Select(d => new BlankDayDto { Date = d.Date, Missing = d.DescribeBlanks() }).ToList();
        return result;
    }

    /// <summary>
    /// Log calendar for one batch: each farm-local day from stocking to the end of culture (Total harvest, failure, or today)
    /// with AM, PM and water cells, and markers for mortality, growth sampling and chemical entries. Works for Closed batches.
    /// </summary>
    public virtual async Task<BatchLogCalendarDto> GetLogCalendar(Guid id)
    {
        var batch = await _batches.GetAll().AsNoTracking().FirstOrDefaultAsync(b => b.Id == id) ?? throw new UserFriendlyException("Batch not found.");
        var result = new BatchLogCalendarDto { BatchId = id };
        if (!batch.StockingDate.HasValue)
        {
            return result;
        }

        var zone = await Farm.GetTimeZoneAsync();
        var until = await _daily.ExpectedUntilAsync(batch, FarmClock.Today(zone), zone);
        if (until < batch.StockingDate.Value)
        {
            return result;
        }

        var days = (await _daily.LoadAsync(new[] { batch }, batch.StockingDate.Value, until, zone, (await Farm.GetFeedingTimesAsync()).Count, await Farm.GetWaterQualityDailyAsync()))[batch.Id];
        var events = await _logs.GetAll().AsNoTracking()
            .Where(l => l.BatchId == id && (l.LogType == LogType.Mortality || l.LogType == LogType.GrowthSampling || l.LogType == LogType.ChemicalApplication))
            .Select(l => new { l.LogType, l.ObservedAtUtc }).ToListAsync();
        var eventDays = events.Select(e => (e.LogType, Day: FarmClock.LocalDate(e.ObservedAtUtc, zone))).ToHashSet();

        result.From = batch.StockingDate;
        result.To = until;
        result.Days = days.Select(d => new BatchLogCalendarDayDto
        {
            Date = d.Date, Feedings = d.Feedings, Water = d.Water,
            HasMortality = eventDays.Contains((LogType.Mortality, d.Date)),
            HasGrowthSampling = eventDays.Contains((LogType.GrowthSampling, d.Date)),
            HasChemical = eventDays.Contains((LogType.ChemicalApplication, d.Date)),
        }).ToList();
        return result;
    }

    /// <summary>DEC-73: feed and chemical lots this batch drew from that are still flagged for stock reconciliation, listed before closing.</summary>
    private async Task FillFlaggedLotsAsync(CloseCheckDto result, Guid batchId)
    {
        var moves = await _movements.GetAll().AsNoTracking().Include(m => m.Lot).ThenInclude(l => l.Item)
            .Where(m => m.BatchId == batchId && m.Lot.NeedsReconciliation).ToListAsync();
        result.FlaggedLots = moves.GroupBy(m => m.LotId).Select(g => g.First().Lot)
            .Select(l => new FlaggedLotDto { LotNumber = l.LotNumber, Product = l.Item.DisplayName }).OrderBy(l => l.Product).ThenBy(l => l.LotNumber).ToList();
    }

    /// <summary>DEC-67: harvested kg neither sold nor recorded as not sold, listed before closing.</summary>
    private async Task FillUnaccountedAsync(CloseCheckDto result, Guid batchId)
    {
        var harvests = await _harvests.GetAll().AsNoTracking().Include(h => h.GradeLines).Include(h => h.Disposals).Where(h => h.BatchId == batchId).ToListAsync();
        var lineIds = harvests.SelectMany(h => h.GradeLines).Select(g => g.Id).ToList();
        var sold = await (from l in _saleLines.GetAll()
                          join s in _sales.GetAll() on l.SaleId equals s.Id
                          where lineIds.Contains(l.HarvestGradeLineId)
                          select (decimal?)l.Kg).SumAsync() ?? 0m;
        result.HarvestedKg = harvests.Sum(h => h.TotalKg);
        result.SoldKg = sold;
        result.NotSoldKg = harvests.SelectMany(h => h.Disposals).Sum(d => d.Kg);
        result.UnaccountedKg = Math.Max(0, result.HarvestedKg - result.SoldKg - result.NotSoldKg);
    }

    /// <summary>Close Batch (Ref 5.5, AC-16): computes and stores final indicators; the batch's records become read-only.</summary>
    [AbpAuthorize(PermissionNames.Production_Manage)]
    public virtual async Task<IndicatorsDto> Close(CloseBatchInput input)
    {
        var batch = await _batches.GetAsync(input.Id);
        Concurrency.Check(batch.RowVersion, input.RowVersion);
        if (batch.Status is not (BatchStatus.Harvested or BatchStatus.Failed))
        {
            throw new UserFriendlyException("Only a Harvested or Failed batch can be closed.");
        }

        if (!input.ConfirmReadOnly)
        {
            throw new UserFriendlyException("Confirm that the batch's records will become read-only.");
        }

        // Recalculate from persisted sales and append-only dispositions at close time; the screen's check can be stale or bypassed.
        var accounting = new CloseCheckDto();
        await FillUnaccountedAsync(accounting, batch.Id);
        if (accounting.UnaccountedKg > 0.0005m)
        {
            throw new UserFriendlyException(
                $"Cannot close this batch: {accounting.UnaccountedKg:0.###} kg of harvested shrimp is not yet accounted for. Record the remaining sales or not-sold outcome first.");
        }

        var facts = await _loader.LoadAsync(batch.Id, await Farm.GetTimeZoneAsync());
        var ind = IndicatorCalculator.Compute(facts, await Farm.GetTodayAsync());
        var failure = await _failures.FirstOrDefaultAsync(f => f.BatchId == batch.Id);
        batch.FinalAbwG = ind.FinalAbwG;
        batch.FinalFcr = ind.FinalFcr;
        batch.SurvivalRatePct = ind.SurvivalRatePct ?? (facts.PlCountStocked > 0 ? 0m : null);
        batch.TotalHarvestKg = ind.TotalHarvestKg;
        batch.TotalFeedKg = ind.CumulativeFeedKg;
        batch.CultureDays = ind.CultureDays ?? (failure != null && batch.StockingDate.HasValue
            ? FarmClock.DaysBetween(batch.StockingDate.Value, failure.FailedOn)
            : null);
        batch.Status = BatchStatus.Closed;
        batch.ClosedAtUtc = DateTime.UtcNow;
        batch.ClosedByUserId = AbpSession.GetUserId();
        return IndicatorsDto.From(ind);
    }
}
