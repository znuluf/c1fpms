using System;
using System.Linq;

namespace Capstone.Production;

/// <summary>
/// Advisory harvest projection from recent ABW growth samples. It deliberately returns no date when the
/// sample history is stale, too short, or biologically implausible; it never changes batch status.
/// </summary>
public static class HarvestForecastCalculator
{
    public static HarvestForecast Compute(BatchFacts facts, DateOnly today, int targetDoc, decimal targetAbwG, bool batchIsActive)
    {
        if (!batchIsActive) return Unavailable("This batch is no longer active.");
        if (!facts.StockingDate.HasValue) return Unavailable("No actual stocking date is recorded.");

        var samples = facts.GrowthSamples
            .Where(x => x.Date <= today && x.AbwG > 0)
            .GroupBy(x => x.Date)
            .Select(g => g.OrderByDescending(x => x.ObservedAtUtc).First())
            .OrderBy(x => x.Date)
            .TakeLast(3)
            .ToList();

        if (samples.Count < 2)
            return Unavailable("Record at least two growth samples on different dates.");

        var latest = samples[^1];
        if (latest.Date < today.AddDays(-14))
            return Unavailable("The latest growth sample is more than 14 days old.");

        var rates = samples.Zip(samples.Skip(1), (a, b) =>
        {
            var days = b.Date.DayNumber - a.Date.DayNumber;
            return days < 3 || days > 30 ? (decimal?)null : (b.AbwG - a.AbwG) / days;
        }).Where(x => x.HasValue && x.Value >= 0.05m && x.Value <= 1.5m)
          .Select(x => x.Value).OrderBy(x => x).ToArray();

        if (rates.Length == 0)
            return Unavailable("Recent samples do not show a reliable positive growth rate.");

        var rate = rates.Length % 2 == 1
            ? rates[rates.Length / 2]
            : (rates[rates.Length / 2 - 1] + rates[rates.Length / 2]) / 2m;

        var currentDoc = Math.Max(0, today.DayNumber - facts.StockingDate.Value.DayNumber);
        var daysToDoc = Math.Max(0, targetDoc - currentDoc);
        var daysToAbw = latest.AbwG >= targetAbwG ? 0 : (int)Math.Ceiling((targetAbwG - latest.AbwG) / rate);
        var docDate = today.AddDays(daysToDoc);
        var abwDate = latest.Date.AddDays(daysToAbw);
        var targetDate = docDate > abwDate ? docDate : abwDate;
        if (targetDate < today) targetDate = today;

        var confidence = rates.Length >= 2 && rates.Max() - rates.Min() <= rate * 0.30m
            ? "High"
            : "Moderate";

        return new HarvestForecast
        {
            From = targetDate.AddDays(-3) < today ? today : targetDate.AddDays(-3),
            To = targetDate.AddDays(3),
            Confidence = confidence,
            SampleDate = latest.Date,
            LatestAbwG = latest.AbwG,
            GrowthRateGPerDay = decimal.Round(rate, 3),
            Reason = null
        };
    }

    private static HarvestForecast Unavailable(string reason) => new() { Reason = reason };
}

public class HarvestForecast
{
    public DateOnly? From { get; set; }
    public DateOnly? To { get; set; }
    public string Confidence { get; set; }
    public DateOnly? SampleDate { get; set; }
    public decimal? LatestAbwG { get; set; }
    public decimal? GrowthRateGPerDay { get; set; }
    public string Reason { get; set; }
}
