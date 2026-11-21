using System;
using System.ComponentModel.DataAnnotations;
using System.Text.RegularExpressions;

namespace Capstone.Validation;

/// <summary>
/// The one phone number format the system accepts and stores (capstone consultation, 21 Nov 2026): a Philippine number written
/// with the digits grouped the way people read them.
/// <list type="bullet">
/// <item>Mobile: <c>0917 123 4567</c> (11 digits, starts with 09).</item>
/// <item>Landline with a 3-digit area code: <c>(083) 552 1234</c>; Metro Manila: <c>(02) 8123 4567</c>.</item>
/// </list>
/// The sign-in form and the screens write numbers in this format as the person types or pastes (including +63 forms); the
/// server accepts nothing else, so every phone number in the records, prints and exports looks the same.
/// The same rules are in <c>angular/src/shared/fpms/phone.ts</c>.
/// </summary>
public static class PhilippinePhone
{
    public const string Message = "Enter a Philippine phone number as 0917 123 4567 (mobile) or (083) 552 1234 (landline).";

    private static readonly Regex Mobile = new(@"^09\d{2} \d{3} \d{4}$", RegexOptions.Compiled);
    private static readonly Regex Landline3 = new(@"^\(0[3-9]\d\) \d{3} \d{4}$", RegexOptions.Compiled);
    private static readonly Regex MetroManila = new(@"^\(02\) \d{4} \d{4}$", RegexOptions.Compiled);

    public static bool IsValid(string value) =>
        value != null && (Mobile.IsMatch(value) || Landline3.IsMatch(value) || MetroManila.IsMatch(value));
}

/// <summary>Checks that a phone number is in the system format. Empty is allowed; combine with [Required] where a number is needed.</summary>
[AttributeUsage(AttributeTargets.Property | AttributeTargets.Field | AttributeTargets.Parameter)]
public sealed class PhilippinePhoneAttribute : ValidationAttribute
{
    public PhilippinePhoneAttribute()
        : base(PhilippinePhone.Message)
    {
    }

    public override bool IsValid(object value)
    {
        return value switch
        {
            null => true,
            string text => string.IsNullOrWhiteSpace(text) || PhilippinePhone.IsValid(text.Trim()),
            _ => false,
        };
    }
}
