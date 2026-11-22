using Abp.Authorization;
using Abp.Domain.Repositories;
using Abp.UI;
using Capstone.Authorization;
using Capstone.Production;
using Capstone.Domain;
using Capstone.Ponds;
using System;
using System.ComponentModel.DataAnnotations;
using System.Threading.Tasks;

namespace Capstone.Farms;

public class FarmSettingsDto
{
    public string RowVersion { get; set; }
    [Required, StringLength(64)] public string TimeZone { get; set; }
    [Range(1, 365)] public int DocumentExpiryAlertDays { get; set; }
    public FarmingSystem FarmingSystem { get; set; } = FarmingSystem.SemiIntensive;
    public FarmDateOrder DateOrder { get; set; } = FarmDateOrder.MonthFirst;
    public bool Use24HourTime { get; set; }
    [StringLength(FeedingSchedule.MaxTimesLength)] public string FeedingTimes { get; set; }
    public bool WaterQualityDaily { get; set; } = true;
}

/// <summary>Operational defaults and display preferences, separate from farm identity and contact details.</summary>
[AbpAuthorize(PermissionNames.FarmSettings)]
public class FarmSettingsAppService : CapstoneAppServiceBase
{
    private readonly IRepository<FarmSettings, int> _settings;

    public FarmSettingsAppService(IRepository<FarmSettings, int> settings) => _settings = settings;

    public virtual async Task<FarmSettingsDto> Get()
    {
        return Map(await Farm.GetSettingsAsync());
    }

    [AbpAuthorize(PermissionNames.FarmSettings_Edit)]
    public virtual async Task Update(FarmSettingsDto input)
    {
        try { TimeZoneInfo.FindSystemTimeZoneById(input.TimeZone); }
        catch (Exception) when (input.TimeZone != FarmClock.DefaultTimeZone)
        { throw new UserFriendlyException($"Unknown time zone '{input.TimeZone}'. Use an IANA name such as Asia/Manila."); }

        if (!Enum.IsDefined(input.FarmingSystem)) throw new UserFriendlyException("Choose a valid farming system.");
        if (!Enum.IsDefined(input.DateOrder)) throw new UserFriendlyException("Choose a valid date display order.");
        var feedingTimes = FeedingSchedule.Format(FeedingSchedule.Parse(input.FeedingTimes));

        var tenantId = Farm.TenantId;
        var s = await _settings.FirstOrDefaultAsync(x => x.Id == tenantId);
        if (s == null)
        {
            var previous = await Farm.GetSettingsAsync();
            s = new FarmSettings
            {
                Id = tenantId, TenantId = tenantId, TimeZone = previous.TimeZone,
                DocumentExpiryAlertDays = previous.DocumentExpiryAlertDays, FarmingSystem = previous.FarmingSystem,
                DateOrder = previous.DateOrder, Use24HourTime = previous.Use24HourTime,
                FeedingTimes = previous.FeedingTimes, WaterQualityDaily = previous.WaterQualityDaily,
            };
            await _settings.InsertAsync(s);
        }
        else
        {
            Production.Concurrency.Check(s.RowVersion, input.RowVersion);
        }

        s.TimeZone = input.TimeZone;
        s.DocumentExpiryAlertDays = input.DocumentExpiryAlertDays;
        s.FarmingSystem = input.FarmingSystem;
        s.DateOrder = input.DateOrder;
        s.Use24HourTime = input.Use24HourTime;
        s.FeedingTimes = feedingTimes;
        s.WaterQualityDaily = input.WaterQualityDaily;
    }

    private static FarmSettingsDto Map(FarmSettings s) => new()
    {
        RowVersion = Production.Concurrency.Encode(s.RowVersion),
        TimeZone = s.TimeZone,
        DocumentExpiryAlertDays = s.DocumentExpiryAlertDays,
        FarmingSystem = s.FarmingSystem,
        DateOrder = s.DateOrder,
        Use24HourTime = s.Use24HourTime,
        FeedingTimes = FeedingSchedule.Format(FeedingSchedule.Times(s.FeedingTimes)),
        WaterQualityDaily = s.WaterQualityDaily,
    };
}
