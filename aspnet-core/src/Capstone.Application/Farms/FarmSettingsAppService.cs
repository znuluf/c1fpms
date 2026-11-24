using Abp.Authorization;
using Abp.Domain.Repositories;
using Abp.UI;
using Capstone.Authorization;
using Capstone.Production;
using Capstone.Domain;
using Capstone.Ponds;
using System;
using System.ComponentModel.DataAnnotations;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;

namespace Capstone.Farms;

public class BaseAbwPricingSchemeDto
{
    public Guid Id { get; set; }
    [Required, StringLength(60)] public string Name { get; set; }
    public decimal BasePricePerKg { get; set; }
    public decimal BaseAbwG { get; set; }
    public decimal StepPerG { get; set; }
    public bool IsActive { get; set; } = true;
}

public class FarmSettingsDto
{
    public string RowVersion { get; set; }
    [Required, StringLength(64)] public string TimeZone { get; set; }
    [Range(1, 365)] public int DocumentExpiryAlertDays { get; set; }
    [Range(1, 60, ErrorMessage = "The unsold shrimp follow-up must be 1 to 60 days.")] public int UnsoldFollowUpDays { get; set; } = 7;
    public FarmingSystem FarmingSystem { get; set; } = FarmingSystem.SemiIntensive;
    public FarmDateOrder DateOrder { get; set; } = FarmDateOrder.MonthFirst;
    public bool Use24HourTime { get; set; }
    [StringLength(FeedingSchedule.MaxTimesLength)] public string FeedingTimes { get; set; }
    public bool WaterQualityDaily { get; set; } = true;
    public List<BaseAbwPricingSchemeDto> BaseAbwPricingSchemes { get; set; } = new();
}

/// <summary>Operational defaults and display preferences, separate from farm identity and contact details.</summary>
[AbpAuthorize(PermissionNames.FarmSettings)]
public class FarmSettingsAppService : CapstoneAppServiceBase
{
    private readonly IRepository<FarmSettings, int> _settings;

    public FarmSettingsAppService(IRepository<FarmSettings, int> settings) => _settings = settings;

    public virtual async Task<FarmSettingsDto> Get()
    {
        // Read the persisted row directly. FarmContext intentionally caches its fallback settings
        // for the lifetime of a consumer; after the first settings row is created, that cached
        // fallback can otherwise hide the newly persisted Base ABW schemes in this request scope.
        var saved = await _settings.FirstOrDefaultAsync(x => x.Id == Farm.TenantId);
        return Map(saved ?? await Farm.GetSettingsAsync());
    }

    [AbpAuthorize(PermissionNames.FarmSettings_Edit)]
    public virtual async Task Update(FarmSettingsDto input)
    {
        try { TimeZoneInfo.FindSystemTimeZoneById(input.TimeZone); }
        catch (Exception) when (input.TimeZone != FarmClock.DefaultTimeZone)
        { throw new UserFriendlyException($"Unknown time zone '{input.TimeZone}'. Use an IANA name such as Asia/Manila."); }

        if (!Enum.IsDefined(input.FarmingSystem)) throw new UserFriendlyException("Choose a valid farming system.");
        if (!Enum.IsDefined(input.DateOrder)) throw new UserFriendlyException("Choose a valid date display order.");
        var schemes = input.BaseAbwPricingSchemes ?? new List<BaseAbwPricingSchemeDto>();
        if (schemes.Count > 20) throw new UserFriendlyException("A farm can configure up to 20 Base ABW pricing schemes.");
        if (schemes.Any(x => x.Id == Guid.Empty || string.IsNullOrWhiteSpace(x.Name) || x.Name.Trim().Length > 60
            || x.BasePricePerKg < 0 || x.BasePricePerKg > 100000000m || x.BasePricePerKg != Math.Round(x.BasePricePerKg, 2)
            || x.BaseAbwG < 0.01m || x.BaseAbwG > 60 || x.BaseAbwG != Math.Round(x.BaseAbwG, 2)
            || x.StepPerG < 0 || x.StepPerG > 1000000m || x.StepPerG != Math.Round(x.StepPerG, 2)))
            throw new UserFriendlyException("Check each Base ABW scheme: prices and adjustments must be 0 to 2 decimal places, and the base ABW must be 0.01 to 60 g with 2 decimal places at most.");
        if (schemes.Select(x => x.Id).Distinct().Count() != schemes.Count
            || schemes.Select(x => x.Name.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).Count() != schemes.Count)
            throw new UserFriendlyException("Base ABW scheme IDs and names must be unique.");
        foreach (var scheme in schemes) scheme.Name = scheme.Name.Trim();

        var feedingTimes = FeedingSchedule.Format(FeedingSchedule.Parse(input.FeedingTimes));

        var tenantId = Farm.TenantId;
        var s = await _settings.FirstOrDefaultAsync(x => x.Id == tenantId);
        if (s == null)
        {
            var previous = await Farm.GetSettingsAsync();
            s = new FarmSettings
            {
                Id = tenantId, TenantId = tenantId, TimeZone = previous.TimeZone,
                DocumentExpiryAlertDays = previous.DocumentExpiryAlertDays, UnsoldFollowUpDays = previous.UnsoldFollowUpDays, FarmingSystem = previous.FarmingSystem,
                DateOrder = previous.DateOrder, Use24HourTime = previous.Use24HourTime,
                FeedingTimes = previous.FeedingTimes, WaterQualityDaily = previous.WaterQualityDaily,
                BaseAbwPricingSchemesJson = previous.BaseAbwPricingSchemesJson,
            };
            await _settings.InsertAsync(s);
        }
        else
        {
            Production.Concurrency.Check(s.RowVersion, input.RowVersion);
        }

        s.TimeZone = input.TimeZone;
        s.DocumentExpiryAlertDays = input.DocumentExpiryAlertDays;
        s.UnsoldFollowUpDays = input.UnsoldFollowUpDays;
        s.FarmingSystem = input.FarmingSystem;
        s.DateOrder = input.DateOrder;
        s.Use24HourTime = input.Use24HourTime;
        s.FeedingTimes = feedingTimes;
        s.WaterQualityDaily = input.WaterQualityDaily;
        s.BaseAbwPricingSchemesJson = JsonSerializer.Serialize(schemes);
    }

    private static FarmSettingsDto Map(FarmSettings s) => new()
    {
        RowVersion = Production.Concurrency.Encode(s.RowVersion),
        TimeZone = s.TimeZone,
        DocumentExpiryAlertDays = s.DocumentExpiryAlertDays,
        UnsoldFollowUpDays = s.UnsoldFollowUpDays,
        FarmingSystem = s.FarmingSystem,
        DateOrder = s.DateOrder,
        Use24HourTime = s.Use24HourTime,
        FeedingTimes = FeedingSchedule.Format(FeedingSchedule.Times(s.FeedingTimes)),
        WaterQualityDaily = s.WaterQualityDaily,
        BaseAbwPricingSchemes = ReadSchemes(s.BaseAbwPricingSchemesJson),
    };

    private static List<BaseAbwPricingSchemeDto> ReadSchemes(string json)
    {
        try { return JsonSerializer.Deserialize<List<BaseAbwPricingSchemeDto>>(json ?? "[]") ?? new(); }
        catch (JsonException) { return new(); }
    }
}
