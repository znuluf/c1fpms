using Abp.Domain.Entities.Auditing;
using Capstone.Production;
using Capstone.Ponds;
using Capstone.Domain;

namespace Capstone.Farms;

/// <summary>Operational and display preferences for one farm. Id and TenantId are the owning farm's tenant ID.</summary>
public class FarmSettings : AuditedEntity<int>, Abp.Domain.Entities.IMustHaveTenant
{
    [System.ComponentModel.DataAnnotations.Timestamp]
    public byte[] RowVersion { get; set; }

    public int TenantId { get; set; }
    public string TimeZone { get; set; } = FarmClock.DefaultTimeZone;
    public int DocumentExpiryAlertDays { get; set; } = 30;

    /// <summary>
    /// Days after a harvest when shrimp still unsold are followed up (DEC-140). 7 is a starting value the partner farm still
    /// has to confirm; the farm's own period replaces it.
    /// </summary>
    public int UnsoldFollowUpDays { get; set; } = 7;
    public FarmingSystem FarmingSystem { get; set; } = FarmingSystem.SemiIntensive;
    public FarmDateOrder DateOrder { get; set; } = FarmDateOrder.MonthFirst;
    public bool Use24HourTime { get; set; }
    public string FeedingTimes { get; set; } = FeedingSchedule.DefaultTimes;
    public bool WaterQualityDaily { get; set; } = true;

    /// <summary>Default target harvest average body weight (grams); null means no farm default is configured.</summary>
    public decimal? DefaultHarvestTargetAbwG { get; set; }

    /// <summary>Default maximum culture duration in days; this is a time limit, not a minimum harvest age.</summary>
    public int DefaultMaxCultureDays { get; set; } = 90;

    /// <summary>Farm-wide reusable Base ABW pricing presets. Sale lines snapshot the selected terms.</summary>
    public string BaseAbwPricingSchemesJson { get; set; } = "[]";

}
