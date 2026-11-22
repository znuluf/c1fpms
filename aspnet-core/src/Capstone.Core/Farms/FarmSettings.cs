using Abp.Domain.Entities.Auditing;
using Capstone.Production;

namespace Capstone.Farms;

/// <summary>Operational and display preferences for one farm. Id and TenantId are the owning farm's tenant ID.</summary>
public class FarmSettings : AuditedEntity<int>, Abp.Domain.Entities.IMustHaveTenant
{
    [System.ComponentModel.DataAnnotations.Timestamp]
    public byte[] RowVersion { get; set; }

    public int TenantId { get; set; }
    public string TimeZone { get; set; } = FarmClock.DefaultTimeZone;
    public int DocumentExpiryAlertDays { get; set; } = 30;
    public FarmingSystem FarmingSystem { get; set; } = FarmingSystem.SemiIntensive;
    public FarmDateOrder DateOrder { get; set; } = FarmDateOrder.MonthFirst;
    public bool Use24HourTime { get; set; }
    public string FeedingTimes { get; set; } = FeedingSchedule.DefaultTimes;
    public bool WaterQualityDaily { get; set; } = true;
}
