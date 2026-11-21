using Capstone.Tests.Fpms;
using System;
using Xunit;

namespace Capstone.Tests;

/// <summary>
/// A test on a real SQL Server database, made for the test by the committed migrations and dropped afterwards, with
/// transactions on as in the API. For what EF in-memory cannot show: row versions, unique indexes, locks and
/// read-committed snapshot. Skipped (see <see cref="SqlServerFactAttribute"/>) when FPMS_TEST_SQLSERVER is not set.
/// </summary>
[Collection(SqlServerCollection.Name)]
public abstract class SqlServerTestBase : FpmsTestBase
{
    // Field initializers run before the base constructor, which starts the module and seeds the database.
    private readonly TestDatabase _database = TestDatabase.Request();

    protected SqlServerTestBase()
    {
        TestDatabase.Clear();
    }

    protected string ConnectionString => _database.ConnectionString;

    public override void Dispose()
    {
        base.Dispose();
        _database?.Drop();
    }
}

/// <summary>SQL Server tests run one class at a time, so their timings do not depend on each other.</summary>
[CollectionDefinition(Name, DisableParallelization = true)]
public sealed class SqlServerCollection
{
    public const string Name = "SQL Server";
}

/// <summary>A fact that runs only when FPMS_TEST_SQLSERVER points at a SQL Server.</summary>
public sealed class SqlServerFactAttribute : FactAttribute
{
    public SqlServerFactAttribute()
    {
        if (!TestDatabase.SqlServerAvailable)
        {
            Skip = $"Needs SQL Server: set {TestDatabase.Variable} to a connection string (the database is created and dropped by the test).";
        }
    }
}
