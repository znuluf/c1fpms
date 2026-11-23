using Abp.Dependency;
using Abp.EntityFrameworkCore;
using Capstone.Domain;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using System;
using System.Threading.Tasks;

namespace Capstone.EntityFrameworkCore.Sequences;

/// <summary>SQL Server: SELECT … WITH (UPDLOCK, ROWLOCK) in the caller's transaction. Other providers: no lock (tests).</summary>
public class RowLocker : IRowLocker, ITransientDependency
{
    private readonly IDbContextProvider<CapstoneDbContext> _dbContextProvider;

    public RowLocker(IDbContextProvider<CapstoneDbContext> dbContextProvider)
    {
        _dbContextProvider = dbContextProvider;
    }

    public async Task LockAsync(RowLockTarget target, Guid id)
    {
        var context = await _dbContextProvider.GetDbContextAsync();
        if (!context.Database.IsSqlServer())
        {
            return;
        }

        var table = target switch
        {
            RowLockTarget.FryDelivery => "FpmsFryDeliveries",
            RowLockTarget.HarvestGradeLine => "FpmsHarvestGradeLines",
            RowLockTarget.Harvest => "FpmsHarvests",
            RowLockTarget.Pond => "FpmsPonds",
            RowLockTarget.Batch => "FpmsPondBatches",
            RowLockTarget.Sale => "FpmsSales",
            _ => throw new ArgumentOutOfRangeException(nameof(target)),
        };

        // The table name comes from the fixed list above, never from input.
        await context.Database.ExecuteSqlRawAsync($"SELECT Id FROM [{table}] WITH (UPDLOCK, ROWLOCK) WHERE Id = @id", new SqlParameter("@id", id));
    }

    public async Task LockRequestAsync(string kind, Guid clientRequestId)
    {
        var context = await _dbContextProvider.GetDbContextAsync();
        if (!context.Database.IsSqlServer() || context.Database.CurrentTransaction == null || clientRequestId == Guid.Empty)
        {
            return;
        }

        // An application lock on the request id, owned by this transaction. If it cannot be had in 30 seconds the save
        // goes on: the unique index on ClientRequestId still refuses a second copy.
        await context.Database.ExecuteSqlRawAsync(
            "EXEC sp_getapplock @Resource = @resource, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 30000",
            new SqlParameter("@resource", $"fpms-request:{kind}:{clientRequestId:N}"));
    }
}
