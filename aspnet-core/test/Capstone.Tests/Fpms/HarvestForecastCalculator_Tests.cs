using Capstone.Production;
using Shouldly;
using System;
using System.Collections.Generic;
using Xunit;

namespace Capstone.Tests.Fpms;

public class HarvestForecastCalculator_Tests
{
    [Fact]
    public void Forecast_uses_recent_positive_growth_and_the_later_of_doc_or_abw_targets()
    {
        var today = new DateOnly(2026, 11, 27);
        var facts = new BatchFacts
        {
            StockingDate = today.AddDays(-60),
            GrowthSamples = new List<GrowthSampleFact>
            {
                new() { Date = today.AddDays(-10), ObservedAtUtc = today.AddDays(-10).ToDateTime(TimeOnly.Noon), AbwG = 10m },
                new() { Date = today, ObservedAtUtc = today.ToDateTime(TimeOnly.Noon), AbwG = 15m },
            }
        };

        var result = HarvestForecastCalculator.Compute(facts, today, targetDoc: 90, targetAbwG: 20m, batchIsActive: true);

        result.From.ShouldBe(today.AddDays(27));
        result.To.ShouldBe(today.AddDays(33));
        result.Confidence.ShouldBe("Moderate");
        result.GrowthRateGPerDay.ShouldBe(0.5m);
        result.SampleDate.ShouldBe(today);
    }

    [Fact]
    public void Forecast_is_unavailable_without_two_growth_samples()
    {
        var today = new DateOnly(2026, 11, 27);
        var facts = new BatchFacts { StockingDate = today.AddDays(-30) };

        var result = HarvestForecastCalculator.Compute(facts, today, 90, 20m, true);

        result.From.ShouldBeNull();
        result.To.ShouldBeNull();
        result.Reason.ShouldContain("two growth samples");
    }

    [Fact]
    public void Forecast_is_unavailable_when_latest_sample_is_stale()
    {
        var today = new DateOnly(2026, 11, 27);
        var facts = new BatchFacts
        {
            StockingDate = today.AddDays(-60),
            GrowthSamples = new List<GrowthSampleFact>
            {
                new() { Date = today.AddDays(-30), ObservedAtUtc = today.AddDays(-30).ToDateTime(TimeOnly.Noon), AbwG = 10m },
                new() { Date = today.AddDays(-20), ObservedAtUtc = today.AddDays(-20).ToDateTime(TimeOnly.Noon), AbwG = 15m },
            }
        };

        var result = HarvestForecastCalculator.Compute(facts, today, 90, 20m, true);

        result.From.ShouldBeNull();
        result.Reason.ShouldContain("more than 14 days old");
    }

    [Fact]
    public void Forecast_is_unavailable_for_closed_or_otherwise_inactive_batches()
    {
        var today = new DateOnly(2026, 11, 27);
        var facts = new BatchFacts { StockingDate = today.AddDays(-60) };

        var result = HarvestForecastCalculator.Compute(facts, today, 90, 20m, false);

        result.From.ShouldBeNull();
        result.Reason.ShouldContain("no longer active");
    }
}
