using System;
using System.Threading.Tasks;

namespace Capstone.Domain;

/// <summary>Parent rows that cross-row checks lock before checking (spec Section 6, DEC-38).</summary>
public enum RowLockTarget { FryDelivery = 1, HarvestGradeLine = 2, Harvest = 3, Pond = 4, Batch = 5, Sale = 6 }

/// <summary>
/// Takes an update lock on a parent row inside the current transaction, so two saves that check the same total
/// (for example PL left in a fry delivery) run one after the other instead of both passing the check.
/// </summary>
public interface IRowLocker
{
    Task LockAsync(RowLockTarget target, Guid id);

    /// <summary>
    /// Makes saves that carry the same request id run one after the other (DEC-134): a retry that arrives while the first
    /// attempt is still saving waits for it, then finds the record it saved, instead of failing on the unique index.
    /// Held until the transaction ends.
    /// </summary>
    Task LockRequestAsync(string kind, Guid clientRequestId);
}
