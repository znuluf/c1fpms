using Capstone.Domain;
using Capstone.Ponds;
using Capstone.Resources;
using System;

namespace Capstone.Production;

/// <summary>
/// A planned stocking event. It is deliberately separate from PondBatch: creating or rescheduling one
/// must never start DOC, allocate fry, or create production indicators.
/// </summary>
public class PlannedStocking : FarmEntity
{
    public const int MaxNotesLength = 500;

    public Guid PondId { get; set; }
    public Pond Pond { get; set; }

    /// <summary>Optional delivery association for coordination only; this does not reserve or allocate PL.</summary>
    public Guid? FryDeliveryId { get; set; }
    public FryDelivery FryDelivery { get; set; }

    /// <summary>Farm-local date on which the farm intends to stock.</summary>
    public DateOnly PlannedDate { get; set; }

    public string Notes { get; set; }

    public PlannedStockingStatus Status { get; set; } = PlannedStockingStatus.Planned;

    public DateTime? CancelledAtUtc { get; set; }
}

public enum PlannedStockingStatus
{
    Planned = 1,
    Cancelled = 2
}
