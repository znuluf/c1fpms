using Abp.Application.Services.Dto;
using Abp.Auditing;
using Abp.Authorization;
using Abp.Authorization.Users;
using Abp.Configuration;
using Abp.Domain.Repositories;
using Abp.Domain.Uow;
using Abp.UI;
using Capstone.Authorization;
using Capstone.Authorization.Roles;
using Capstone.Authorization.Users;
using Capstone.Configuration;
using Capstone.MultiTenancy;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Linq;
using System.Security.Cryptography;
using System.Threading.Tasks;

namespace Capstone.SystemAdmin;

public class SystemFarmDto
{
    public int TenantId { get; set; }
    public string FarmCode { get; set; }
    /// <summary>A-LL-FF, or null while the farm has not been given its number.</summary>
    public string FarmId { get; set; }
    public string Name { get; set; }
    public bool IsActive { get; set; }
    public DateTime CreationTime { get; set; }
    public int UserCount { get; set; }
}

public class SetFarmActiveInput
{
    public int TenantId { get; set; }
    public bool IsActive { get; set; }
}

public class SetFarmIdInput
{
    public int TenantId { get; set; }
    /// <summary>0 General Santos City, 1 Sarangani.</summary>
    [Range(0, 9)] public int Area { get; set; }
    [Range(1, 99)] public int Place { get; set; }
    [Range(1, 99)] public int FarmNumber { get; set; }
    [Required, StringLength(300)] public string Reason { get; set; }
}

public class RegistrationSettingDto
{
    public bool IsEnabled { get; set; }
}

/// <summary>
/// System Administration: farm accounts and the registration switch (D-16). Host code here only loads
/// AbpTenants and AbpUsers, never farm-owned production, inventory, sales, finance or document records.
/// </summary>
[AbpAuthorize(PermissionNames.System_Farms)]
public class SystemFarmAppService : CapstoneAppServiceBase
{
    private readonly IRepository<Tenant, int> _tenants;
    private readonly IRepository<Capstone.Farms.FarmProfile, int> _profiles;

    public SystemFarmAppService(IRepository<Tenant, int> tenants, IRepository<Capstone.Farms.FarmProfile, int> profiles)
    {
        _tenants = tenants;
        _profiles = profiles;
    }

    public virtual async Task<List<SystemFarmDto>> GetFarms()
    {
        var tenants = await _tenants.GetAll().AsNoTracking().OrderBy(t => t.TenancyName).ToListAsync();
        Dictionary<int, int> counts;
        Dictionary<int, string> farmIds;
        using (CurrentUnitOfWork.DisableFilter(AbpDataFilters.MayHaveTenant, AbpDataFilters.MustHaveTenant))
        {
            // Only the three digits of the Farm ID are read from the farm's profile, nothing else.
            farmIds = (await _profiles.GetAll().AsNoTracking().Where(f => f.LotFarmNumber != null)
                .Select(f => new { f.Id, f.LotAreaCode, f.LotPlaceCode, f.LotFarmNumber }).ToListAsync())
                .ToDictionary(f => f.Id, f => $"{f.LotAreaCode}-{f.LotPlaceCode:00}-{f.LotFarmNumber:00}");
            counts = await UserRepository.GetAll().Where(u => u.TenantId != null).GroupBy(u => u.TenantId.Value)
                .Select(g => new { g.Key, N = g.Count() }).ToDictionaryAsync(x => x.Key, x => x.N);
        }

        return tenants.Select(t => new SystemFarmDto
        {
            TenantId = t.Id, FarmCode = t.TenancyName, FarmId = farmIds.TryGetValue(t.Id, out var fid) ? fid : null, Name = t.Name, IsActive = t.IsActive, CreationTime = t.CreationTime,
            UserCount = counts.TryGetValue(t.Id, out var n) ? n : 0,
        }).ToList();
    }

    /// <summary>
    /// Corrects a Farm ID given in error (docs/farm-id-proposal.md section 4). Only the System Administrator may, with a reason;
    /// the new ID must be free, because an ID is never shared or reused. The reason and both IDs go to the log.
    /// </summary>
    public virtual async Task SetFarmId(SetFarmIdInput input)
    {
        if (string.IsNullOrWhiteSpace(input.Reason))
        {
            throw new Abp.UI.UserFriendlyException("Give the reason for the correction.");
        }

        var max = input.Area == Capstone.Harvests.LotPlaces.GenSanArea ? Capstone.Harvests.LotPlaces.GenSanBarangays.Count
            : input.Area == Capstone.Harvests.LotPlaces.SaranganiArea ? Capstone.Harvests.LotPlaces.SaranganiMunicipalities.Count : 0;
        if (input.Place > max)
        {
            throw new Abp.UI.UserFriendlyException("That place is not on the list. General Santos is area 0 (places 01–26); Sarangani is area 1 (places 01–07).");
        }

        using (CurrentUnitOfWork.DisableFilter(AbpDataFilters.MayHaveTenant, AbpDataFilters.MustHaveTenant))
        {
            if (await _profiles.GetAll().AnyAsync(f => f.Id != input.TenantId && f.LotAreaCode == input.Area && f.LotPlaceCode == input.Place && f.LotFarmNumber == input.FarmNumber))
            {
                throw new Abp.UI.UserFriendlyException($"{input.Area}-{input.Place:00}-{input.FarmNumber:00} already belongs to another farm.");
            }

            var profile = await _profiles.FirstOrDefaultAsync(f => f.Id == input.TenantId)
                          ?? throw new Abp.UI.UserFriendlyException("This farm has no profile yet.");
            var old = profile.LotFarmNumber.HasValue ? $"{profile.LotAreaCode}-{profile.LotPlaceCode:00}-{profile.LotFarmNumber:00}" : "none";
            profile.LotAreaCode = input.Area;
            profile.LotPlaceCode = input.Place;
            profile.LotFarmNumber = input.FarmNumber;
            Logger.Warn($"Farm ID of farm {input.TenantId} corrected from {old} to {input.Area}-{input.Place:00}-{input.FarmNumber:00}. Reason: {input.Reason}");
        }
    }

    public virtual async Task SetFarmActive(SetFarmActiveInput input)
    {
        var tenant = await TenantManager.GetByIdAsync(input.TenantId);
        tenant.IsActive = input.IsActive;
        await TenantManager.UpdateAsync(tenant);
    }

    public virtual async Task<RegistrationSettingDto> GetRegistrationSetting()
    {
        return new RegistrationSettingDto { IsEnabled = await SettingManager.GetSettingValueForApplicationAsync<bool>(AppSettingNames.RegistrationEnabled) };
    }

    public virtual async Task SetRegistrationSetting(RegistrationSettingDto input)
    {
        await SettingManager.ChangeSettingForApplicationAsync(AppSettingNames.RegistrationEnabled, input.IsEnabled ? "true" : "false");
    }
}

public enum IdentityVerificationMethod
{
    SecondFarmOwner = 1,
    SecurityQuestion = 2,
}

public class RecoveryUserDto
{
    public long UserId { get; set; }
    public string UserName { get; set; }
    public string FullName { get; set; }
    public string RoleName { get; set; }
    public bool IsActive { get; set; }
    public bool IsLockedOut { get; set; }
    public bool MustChangePassword { get; set; }
}

public class RecoveryActionInput
{
    public int TenantId { get; set; }
    public long UserId { get; set; }

    /// <summary>The administrator confirms identity was verified (D-24).</summary>
    public bool IdentityVerified { get; set; }

    public IdentityVerificationMethod VerificationMethod { get; set; }

    [StringLength(300)]
    public string Note { get; set; }
}

public class TemporaryPasswordDto
{
    public string UserName { get; set; }

    /// <summary>Shown once to the System Administrator; never stored in plain text.</summary>
    [DisableAuditing]
    public string TemporaryPassword { get; set; }
}

/// <summary>Account recovery (US-16, AC-22, D-24). Every action is audit-logged.</summary>
[AbpAuthorize(PermissionNames.System_AccountRecovery)]
public class AccountRecoveryAppService : CapstoneAppServiceBase
{
    private readonly RoleManager _roleManager;

    public AccountRecoveryAppService(RoleManager roleManager)
    {
        _roleManager = roleManager;
    }

    public virtual async Task<List<RecoveryUserDto>> GetFarmUsers(int tenantId)
    {
        await TenantManager.GetByIdAsync(tenantId);
        using (CurrentUnitOfWork.SetTenantId(tenantId))
        {
            var users = await UserRepository.GetAll().AsNoTracking().Include(u => u.Roles).OrderBy(u => u.UserName).ToListAsync();
            var roles = await _roleManager.Roles.AsNoTracking().ToDictionaryAsync(r => r.Id, r => r.DisplayName);
            var now = DateTime.UtcNow;
            return users.Select(u => new RecoveryUserDto
            {
                UserId = u.Id, UserName = u.UserName, FullName = $"{u.Name} {u.Surname}".Trim(),
                RoleName = u.Roles.Select(r => roles.TryGetValue(r.RoleId, out var n) ? n : null).FirstOrDefault(n => n != null),
                IsActive = u.IsActive, IsLockedOut = u.LockoutEndDateUtc.HasValue && u.LockoutEndDateUtc > now, MustChangePassword = u.ShouldChangePasswordOnNextLogin,
            }).ToList();
        }
    }

    public virtual async Task Unlock(RecoveryActionInput input)
    {
        EnsureVerified(input);
        using (CurrentUnitOfWork.SetTenantId(input.TenantId))
        {
            var user = await UserManager.GetUserByIdAsync(input.UserId);
            user.LockoutEndDateUtc = null;
            user.AccessFailedCount = 0;
            CheckErrors(await UserManager.UpdateAsync(user));
            Logger.Info($"Account recovery: unlocked user {user.Id} in farm {input.TenantId} (verified by {input.VerificationMethod}).");
        }
    }

    /// <summary>Issues a temporary password; the user must change it at next sign-in (AC-22).</summary>
    public virtual async Task<TemporaryPasswordDto> IssueTemporaryPassword(RecoveryActionInput input)
    {
        EnsureVerified(input);
        using (CurrentUnitOfWork.SetTenantId(input.TenantId))
        {
            var user = await UserManager.GetUserByIdAsync(input.UserId);
            await UserManager.InitializeOptionsAsync(input.TenantId);
            var password = GenerateTemporaryPassword();
            CheckErrors(await UserManager.ChangePasswordAsync(user, password));
            user.ShouldChangePasswordOnNextLogin = true;
            user.LockoutEndDateUtc = null;
            user.AccessFailedCount = 0;
            user.IsActive = true;
            CheckErrors(await UserManager.UpdateAsync(user));
            Logger.Info($"Account recovery: temporary password issued to user {user.Id} in farm {input.TenantId} (verified by {input.VerificationMethod}).");
            return new TemporaryPasswordDto { UserName = user.UserName, TemporaryPassword = password };
        }
    }

    private static void EnsureVerified(RecoveryActionInput input)
    {
        if (!input.IdentityVerified || !Enum.IsDefined(input.VerificationMethod))
        {
            throw new UserFriendlyException("Confirm that the person's identity was verified through a second Farm Owner or the pre-agreed security question.");
        }
    }

    public static string GenerateTemporaryPassword()
    {
        const string upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
        const string lower = "abcdefghijkmnpqrstuvwxyz";
        const string digits = "23456789";
        var all = upper + lower + digits;
        var chars = new List<char>
        {
            upper[RandomNumberGenerator.GetInt32(upper.Length)],
            lower[RandomNumberGenerator.GetInt32(lower.Length)],
            digits[RandomNumberGenerator.GetInt32(digits.Length)],
        };
        while (chars.Count < 12)
        {
            chars.Add(all[RandomNumberGenerator.GetInt32(all.Length)]);
        }

        return new string(chars.OrderBy(_ => RandomNumberGenerator.GetInt32(1000)).ToArray());
    }
}

public class SecurityLogInput : Capstone.Common.PagedInput
{
    public DateTime? FromUtc { get; set; }
    public DateTime? ToUtc { get; set; }
    public int? TenantId { get; set; }
    public bool FailuresOnly { get; set; }
}

public class LoginAttemptDto
{
    public DateTime CreationTime { get; set; }
    public string FarmCode { get; set; }
    public string UserNameOrEmail { get; set; }
    public string Result { get; set; }
    public string ClientIpAddress { get; set; }
    public string BrowserInfo { get; set; }
}

public class SystemEventDto
{
    public DateTime ExecutionTime { get; set; }
    public int? TenantId { get; set; }
    public long? UserId { get; set; }
    public string Service { get; set; }
    public string Method { get; set; }
    public int DurationMs { get; set; }
    public bool Failed { get; set; }
    public string ErrorType { get; set; }
}

/// <summary>Security and error logs without farm record contents (no parameters, no return values).</summary>
[AbpAuthorize(PermissionNames.System_Logs)]
public class SecurityLogAppService : CapstoneAppServiceBase
{
    private readonly IRepository<UserLoginAttempt, long> _attempts;
    private readonly IRepository<AuditLog, long> _auditLogs;

    public SecurityLogAppService(IRepository<UserLoginAttempt, long> attempts, IRepository<AuditLog, long> auditLogs)
    {
        _attempts = attempts;
        _auditLogs = auditLogs;
    }

    public virtual async Task<PagedResultDto<LoginAttemptDto>> GetLoginAttempts(SecurityLogInput input)
    {
        using (CurrentUnitOfWork.DisableFilter(AbpDataFilters.MayHaveTenant))
        {
            var query = _attempts.GetAll().AsNoTracking()
                .Where(a => !input.TenantId.HasValue || a.TenantId == input.TenantId)
                .Where(a => !input.FromUtc.HasValue || a.CreationTime >= input.FromUtc)
                .Where(a => !input.ToUtc.HasValue || a.CreationTime < input.ToUtc)
                .Where(a => !input.FailuresOnly || a.Result != AbpLoginResultType.Success);
            var total = await query.CountAsync();
            var list = await query.OrderByDescending(a => a.CreationTime).Skip(input.SkipCount).Take(input.MaxResultCount).ToListAsync();
            return new PagedResultDto<LoginAttemptDto>(total, list.Select(a => new LoginAttemptDto
            {
                CreationTime = a.CreationTime, FarmCode = a.TenancyName, UserNameOrEmail = a.UserNameOrEmailAddress, Result = a.Result.ToString(),
                ClientIpAddress = a.ClientIpAddress, BrowserInfo = a.BrowserInfo,
            }).ToList());
        }
    }

    public virtual async Task<PagedResultDto<SystemEventDto>> GetSystemEvents(SecurityLogInput input)
    {
        using (CurrentUnitOfWork.DisableFilter(AbpDataFilters.MayHaveTenant))
        {
            var query = _auditLogs.GetAll().AsNoTracking()
                .Where(a => !input.TenantId.HasValue || a.TenantId == input.TenantId)
                .Where(a => !input.FromUtc.HasValue || a.ExecutionTime >= input.FromUtc)
                .Where(a => !input.ToUtc.HasValue || a.ExecutionTime < input.ToUtc)
                .Where(a => !input.FailuresOnly || a.Exception != null);
            var total = await query.CountAsync();
            var list = await query.OrderByDescending(a => a.ExecutionTime).Skip(input.SkipCount).Take(input.MaxResultCount)
                .Select(a => new { a.ExecutionTime, a.TenantId, a.UserId, a.ServiceName, a.MethodName, a.ExecutionDuration, a.Exception })
                .ToListAsync();
            return new PagedResultDto<SystemEventDto>(total, list.Select(a => new SystemEventDto
            {
                ExecutionTime = a.ExecutionTime, TenantId = a.TenantId, UserId = a.UserId,
                Service = a.ServiceName?[(a.ServiceName.LastIndexOf('.') + 1)..], Method = a.MethodName, DurationMs = a.ExecutionDuration,
                Failed = a.Exception != null, ErrorType = a.Exception == null ? null : a.Exception.Split(':', 2)[0].Trim(),
            }).ToList());
        }
    }
}
