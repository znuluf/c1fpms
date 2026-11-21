using Abp.Dependency;
using Capstone.EntityFrameworkCore;
using Capstone.Identity;
using Castle.MicroKernel.Registration;
using Castle.Windsor.MsDependencyInjection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using System;

namespace Capstone.Tests.DependencyInjection;

public static class ServiceCollectionRegistrar
{
    public static void Register(IIocManager iocManager)
    {
        var services = new ServiceCollection();

        IdentityRegistrar.Register(services);

        var sqlServer = TestDatabase.Requested;
        if (sqlServer == null)
        {
            services.AddEntityFrameworkInMemoryDatabase();
        }
        else
        {
            services.AddEntityFrameworkSqlServer();
        }

        var serviceProvider = WindsorRegistrationHelper.CreateServiceProvider(iocManager.IocContainer, services);

        var builder = new DbContextOptionsBuilder<CapstoneDbContext>();
        if (sqlServer == null)
        {
            builder.UseInMemoryDatabase(Guid.NewGuid().ToString()).UseInternalServiceProvider(serviceProvider);
        }
        else
        {
            // A new database for this test, built by the migrations generated in this checkout (they are not committed here;
            // see the README), with read-committed snapshot on as .devcontainer/start-fpms.sh sets it.
            builder.UseSqlServer(sqlServer.ConnectionString).UseInternalServiceProvider(serviceProvider);
            using var context = new CapstoneDbContext(builder.Options);
            context.Database.Migrate();
            context.Database.ExecuteSqlRaw($"ALTER DATABASE [{sqlServer.Name}] SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE");
        }

        iocManager.IocContainer.Register(
            Component
                .For<DbContextOptions<CapstoneDbContext>>()
                .Instance(builder.Options)
                .LifestyleSingleton()
        );
    }
}
