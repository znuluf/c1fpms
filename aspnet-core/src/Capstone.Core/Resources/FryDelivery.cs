using Capstone.Domain;
using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace Capstone.Resources;

/// <summary>
/// Current or past status of a fry delivery. "Stocked" is not stored: it is shown when a cycle uses the delivery.
/// Rejected: fry refused at arrival. Cancelled: an order that never shipped (DEC-131).
/// </summary>
public enum FryDeliveryStatus { Ordered = 1, InTransit = 2, Received = 3, Rejected = 4, Cancelled = 5 }

/// <summary>The steps a delivery may take next (DEC-131). Received is reached only through Receive, which takes the count.</summary>
public static class FryDeliveryFlow
{
    public static IReadOnlyList<FryDeliveryStatus> Next(FryDeliveryStatus current) => current switch
    {
        FryDeliveryStatus.Ordered => new[] { FryDeliveryStatus.InTransit, FryDeliveryStatus.Received, FryDeliveryStatus.Cancelled },
        FryDeliveryStatus.InTransit => new[] { FryDeliveryStatus.Received, FryDeliveryStatus.Rejected },
        // Turned away after arriving (failed the gate check), as long as nothing was stocked from it.
        FryDeliveryStatus.Received => new[] { FryDeliveryStatus.Rejected },
        _ => Array.Empty<FryDeliveryStatus>(),
    };

    public static bool IsEnded(FryDeliveryStatus status) => status is FryDeliveryStatus.Rejected or FryDeliveryStatus.Cancelled;
}

/// <summary>One delivery of post-larvae from a hatchery (Log Fries, Ref 3.1a). Exactly one delivery starts one production cycle.</summary>
public class FryDelivery : FarmEntity
{
    public const int MaxBatchNumberLength = 100;
    public const int MaxNotesLength = 500;
    public const long MaxPl = 10_000_000;
    public const int MaxPermitLength = 100;

    public Guid HatcheryId { get; set; }
    public HatcherySource Hatchery { get; set; }

    /// <summary>The hatchery's own batch number (unique per hatchery).</summary>
    public string HatcheryBatchNumber { get; set; }

    public DateOnly DeliveryDate { get; set; }

    /// <summary>PL age in days (PL12 = 12). Null only for deliveries converted from before step C.</summary>
    public int? PlAgeDays { get; set; }

    /// <summary>
    /// PL counted at the farm (DEC-93). Stocking counts, survival and density are worked out from this. Null until the fry
    /// arrive (DEC-131): an order has no count.
    /// </summary>
    public long? PlReceived { get; set; }

    /// <summary>When the fry arrived at the farm (DEC-131); null until received. DeliveryDate is then its farm date.</summary>
    public DateTime? ReceivedAtUtc { get; set; }

    /// <summary>
    /// PL on the hatchery's papers (purchase order or invoice), when known (DEC-93). Hatcheries usually add extra, so the
    /// farm's count can be higher; it is shown beside the count and never used in calculations.
    /// </summary>
    public long? PlOrdered { get; set; }

    public decimal? CostPhp { get; set; }
    public string Notes { get; set; }

    /// <summary>The PL health certificate number that came with this delivery (DEC-59).</summary>
    public string PlHealthCertificateNo { get; set; }

    /// <summary>Optional transport permit number (DEC-59).</summary>
    public string TransportPermitNo { get; set; }

    /// <summary>How the fry travelled from the hatchery, optional (DEC-128). One trip for the whole delivery.</summary>
    public Production.TransportMode? TransportMode { get; set; }

    /// <summary>When the hatchery packed the fry, optional (DEC-128; was "time processed" per batch).</summary>
    public DateTime? TimePackedUtc { get; set; }

    /// <summary>Optional Shrimp Fry Source Certification (SFSC) number for this delivery (DEC-70).</summary>
    public string SfscNo { get; set; }

    /// <summary>Set by Finish stocking (DEC-63): the delivery is accounted for and cannot be stocked from again.</summary>
    public DateTime? StockingFinishedAtUtc { get; set; }

    public long? StockingFinishedByUserId { get; set; }

    public bool IsStockingFinished => StockingFinishedAtUtc.HasValue;

    [Timestamp]
    public byte[] RowVersion { get; set; }
}

/// <summary>Dated status history of a delivery (AC-06). The current status is the latest change; who made it is CreatorUserId.</summary>
public class FryDeliveryStatusChange : FarmEntity
{
    public const int MaxNoteLength = 500;

    public Guid DeliveryId { get; set; }
    public FryDeliveryStatus Status { get; set; }
    public DateTime ChangedAtUtc { get; set; }
    public string Note { get; set; }
}

/// <summary>Why PL of a delivery were not stocked (DEC-63).</summary>
public enum ShortfallReason { DeadOnArrival = 1, Discarded = 2, Returned = 3, CountDifference = 4 }

/// <summary>
/// PL of a delivery that were not stocked, recorded at Finish stocking (DEC-63) so that
/// PL received = Σ stocking counts + Σ shortfall counts.
/// </summary>
public class FryDeliveryShortfall : FarmEntity
{
    public const int MaxNoteLength = 500;

    public Guid DeliveryId { get; set; }
    public ShortfallReason Reason { get; set; }
    public long Count { get; set; }
    public string Note { get; set; }
}
