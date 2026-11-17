using Capstone.Ponds;
using Capstone.ReferenceData;
using System.Linq;

namespace Capstone.EntityFrameworkCore.Seed.Host;

/// <summary>
/// Stocking density bands per farming system and construction type, from PNS/BAFS 197:2025 Annex C (DEC-56, DEC-65 †).
/// Concrete and HDPE-lined start at the lined values. Rows that exist are left alone, so values edited later are kept.
/// </summary>
public class DensityBandCreator
{
    public const string Source = "PNS/BAFS 197:2025 Annex C";
    public const string NoStandardSource = "No value in PNS/BAFS 197:2025; set the farm's own in Farm Standards";

    private readonly CapstoneDbContext _context;

    public DensityBandCreator(CapstoneDbContext context)
    {
        _context = context;
    }

    public void Create()
    {
        foreach (var construction in new[] { PondConstructionType.Earthen, PondConstructionType.Concrete, PondConstructionType.HdpeLined })
        {
            Add(FarmingSystem.Extensive, construction, 1m, 30m);
            Add(FarmingSystem.SemiIntensive, construction, 40m, 60m);
            if (construction == PondConstructionType.Earthen)
            {
                Add(FarmingSystem.Intensive, construction, 70m, 90m);
            }
            else
            {
                Add(FarmingSystem.Intensive, construction, 100m, 140m);
            }

            // No national value (DEC-124): an open band, so nothing is judged until the farm sets its own in Farm Standards.
            Add(FarmingSystem.SuperIntensive, construction, null, null, NoStandardSource);
        }

        _context.SaveChanges();
    }

    private void Add(FarmingSystem system, PondConstructionType construction, decimal? min, decimal? max, string source = Source)
    {
        if (_context.DensityBands.Any(b => b.FarmingSystem == system && b.ConstructionType == construction))
        {
            return;
        }

        _context.DensityBands.Add(new DensityBand { FarmingSystem = system, ConstructionType = construction, MinPlM2 = min, MaxPlM2 = max, Source = source });
    }
}
