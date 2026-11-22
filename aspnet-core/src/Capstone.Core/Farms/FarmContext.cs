using Abp.Dependency;
using Abp.Domain.Repositories;
using Abp.Runtime.Session;
using Capstone.Domain;
using System;
using System.Threading.Tasks;

namespace Capstone.Farms;

/// <summary>Access (cached per consumer) to the signed-in farm's settings (time zone, alert window).</summary>
public class FarmContext : ITransientDependency
{
    private readonly IRepository<FarmProfile, int> _profiles;
    private readonly IRepository<FarmSettings, int> _settings;
    private readonly IAbpSession _session;
    private FarmProfile _profile;
    private FarmSettings _farmSettings;
    private TimeZoneInfo _zone;

    public FarmContext(IRepository<FarmProfile, int> profiles, IRepository<FarmSettings, int> settings, IAbpSession session)
    {
        _profiles = profiles;
        _settings = settings;
        _session = session;
    }

    public int TenantId => _session.TenantId ?? throw FpmsErrors.Rule("This action is available only inside a farm account.");

    public async Task<FarmProfile> GetProfileAsync()
    {
        if (_profile == null)
        {
            var tenantId = TenantId;
            _profile = await _profiles.FirstOrDefaultAsync(p => p.Id == tenantId)
                       ?? new FarmProfile { Id = tenantId, TenantId = tenantId, FarmName = string.Empty };
        }

        return _profile;
    }

    public async Task<FarmSettings> GetSettingsAsync()
    {
        if (_farmSettings == null)
        {
            var tenantId = TenantId;
            _farmSettings = await _settings.FirstOrDefaultAsync(x => x.Id == tenantId);
            if (_farmSettings == null)
            {
                // Compatibility fallback for existing installations before settings are provisioned separately.
                var profile = await GetProfileAsync();
                _farmSettings = new FarmSettings
                {
                    Id = tenantId, TenantId = tenantId, TimeZone = profile.TimeZone,
                    DocumentExpiryAlertDays = profile.DocumentExpiryAlertDays, FarmingSystem = profile.FarmingSystem,
                    DateOrder = profile.DateOrder, Use24HourTime = profile.Use24HourTime,
                    FeedingTimes = profile.FeedingTimes, WaterQualityDaily = profile.WaterQualityDaily,
                };
            }
        }
        return _farmSettings;
    }

    public async Task<TimeZoneInfo> GetTimeZoneAsync()
    {
        if (_zone == null) _zone = FarmClock.Resolve((await GetSettingsAsync()).TimeZone);
        return _zone;
    }

    /// <summary>The farm's usual feeding times in order (DEC-61); the count is the number of feedings a day.</summary>
    public async Task<System.Collections.Generic.List<string>> GetFeedingTimesAsync() =>
        Capstone.Production.FeedingSchedule.Times((await GetSettingsAsync()).FeedingTimes);

    /// <summary>Whether a day without a water-quality reading counts as a gap (DEC-94).</summary>
    public async Task<bool> GetWaterQualityDailyAsync() => (await GetSettingsAsync()).WaterQualityDaily;

    /// <summary>Whether the farm grades harvests by size (DEC-100).</summary>
    public async Task<bool> GetUsesSizeGradingAsync() => (await GetProfileAsync()).UsesSizeGrading;

    public async Task<DateOnly> GetTodayAsync() => FarmClock.Today(await GetTimeZoneAsync());

    public async Task<DateOnly> ToLocalDateAsync(DateTime utc) => FarmClock.LocalDate(utc, await GetTimeZoneAsync());
}
