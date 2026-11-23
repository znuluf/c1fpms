using Capstone.Domain;

namespace Capstone.Farms;

/// <summary>
/// A farm-wide Base ABW pricing preset. Sales copy the terms onto their sale lines, so later edits or deactivation
/// of this preset do not change historical sale prices.
/// </summary>
public class BaseAbwPricingScheme : FarmEntity
{
    public const int MaxNameLength = 60;

    public string Name { get; set; }
    public decimal BasePricePerKg { get; set; }
    public decimal BaseAbwG { get; set; }
    public decimal StepPerG { get; set; }
    public bool IsActive { get; set; } = true;
}
