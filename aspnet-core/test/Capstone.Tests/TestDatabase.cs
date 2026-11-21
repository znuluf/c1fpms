using Microsoft.Data.SqlClient;
using System;

namespace Capstone.Tests;

/// <summary>
/// Chooses the database for the test being built. Tests use EF in-memory, except classes derived from
/// <see cref="SqlServerTestBase"/>, which get their own SQL Server database when FPMS_TEST_SQLSERVER holds a
/// connection string (CI sets it; see docs/database.md). The choice is made per thread while the test's module starts.
/// </summary>
public sealed class TestDatabase
{
    public const string Variable = "FPMS_TEST_SQLSERVER";

    [ThreadStatic]
    private static TestDatabase _requested;

    private TestDatabase(string connectionString, string name)
    {
        ConnectionString = connectionString;
        Name = name;
    }

    public string ConnectionString { get; }
    public string Name { get; }

    /// <summary>The SQL Server database requested by the test now starting, or null for in-memory.</summary>
    public static TestDatabase Requested => _requested;

    public static string ServerConnectionString => Environment.GetEnvironmentVariable(Variable);

    public static bool SqlServerAvailable => !string.IsNullOrWhiteSpace(ServerConnectionString);

    internal static TestDatabase Request()
    {
        if (!SqlServerAvailable)
        {
            _requested = null;
            return null;
        }

        var name = $"FPMS_Test_{Guid.NewGuid():N}";
        var builder = new SqlConnectionStringBuilder(ServerConnectionString) { InitialCatalog = name, Pooling = false };
        _requested = new TestDatabase(builder.ConnectionString, name);
        return _requested;
    }

    internal static void Clear() => _requested = null;

    public void Drop()
    {
        var master = new SqlConnectionStringBuilder(ServerConnectionString) { InitialCatalog = "master", Pooling = false };
        using var connection = new SqlConnection(master.ConnectionString);
        connection.Open();
        using var command = connection.CreateCommand();
        command.CommandText = $"IF DB_ID(N'{Name}') IS NOT NULL BEGIN ALTER DATABASE [{Name}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [{Name}]; END";
        command.ExecuteNonQuery();
    }
}
