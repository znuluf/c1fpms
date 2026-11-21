using Abp.Runtime.Validation;
using Capstone.Resources;
using Capstone.Validation;
using Shouldly;
using System.Threading.Tasks;
using Xunit;

namespace Capstone.Tests.Fpms;

/// <summary>DEC-139: one phone number format, mobile or landline, and nothing else.</summary>
public class PhilippinePhone_Tests : FpmsTestBase
{
    [Theory]
    [InlineData("0917 123 4567")]
    [InlineData("(083) 552 1234")]
    [InlineData("(02) 8123 4567")]
    public void The_system_format_is_accepted(string phone) => PhilippinePhone.IsValid(phone).ShouldBeTrue();

    [Theory]
    [InlineData("")]
    [InlineData("1")]
    [InlineData("09171234567")]
    [InlineData("0917-123-4567")]
    [InlineData("+63 917 123 4567")]
    [InlineData("0817 123 4567")]
    [InlineData("(083) 5521234")]
    [InlineData("0917 123 456")]
    public void Any_other_writing_is_refused(string phone) => PhilippinePhone.IsValid(phone).ShouldBeFalse();

    [Fact]
    public async Task A_hatchery_cannot_be_saved_with_a_phone_in_another_format()
    {
        var service = Resolve<HatcheryAppService>();
        await Should.ThrowAsync<AbpValidationException>(() =>
            service.Save(new HatcheryDto { Name = "Wrong phone", ShortCode = "WPH", Address = "Glan, Sarangani", Phone = "0917-000-0003" }));
    }
}
