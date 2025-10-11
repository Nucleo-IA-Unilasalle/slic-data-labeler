import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { WoundData } from '@/lib/types/wound-data';

interface DatasetStatistics {
  totalSamples: number;
  tissueDistribution: {
    avgNecrosisPercentage: number;
    avgSloughPercentage: number;
    avgRedTissuePercentage: number;
    stdNecrosisPercentage: number;
    stdSloughPercentage: number;
    stdRedTissuePercentage: number;
  };
  rawScoreAnalysis: {
    avgScores: {
      necrosis: number;
      slough: number;
      red_tissue: number;
    };
    stdScores: {
      necrosis: number;
      slough: number;
      red_tissue: number;
    };
    scoreDistribution: {
      range: string;
      necrosis: number;
      slough: number;
      red_tissue: number;
    }[];
    confidenceMetrics: {
      avgMaxScore: number;
      avgScoreSpread: number;
      avgConfidence: number;
      highConfidenceClusters: number;
      lowConfidenceClusters: number;
      ambiguousClusters: number;
    };
    dominantTissueByScore: {
      necrosis: number;
      slough: number;
      red_tissue: number;
    };
  };
  imageDimensions: {
    avgHeight: number;
    avgWidth: number;
    avgArea: number;
    minHeight: number;
    maxHeight: number;
    minWidth: number;
    maxWidth: number;
  };
  superpixelStats: {
    avgSuperpixels: number;
    minSuperpixels: number;
    maxSuperpixels: number;
    avgClusters: number;
    minClusters: number;
    maxClusters: number;
  };
  tissueTypesByDataset: {
    [key: string]: {
      necrosis: number;
      slough: number;
      red_tissue: number;
      total: number;
    };
  };
  percentageDistribution: {
    range: string;
    necrosis: number;
    slough: number;
    red_tissue: number;
  }[];
  clusterSizeDistribution: {
    range: string;
    count: number;
  }[];
}

function calculateStandardDeviation(values: number[], mean: number): number {
  const squareDiffs = values.map((value: number) => Math.pow(value - mean, 2));
  const avgSquareDiff = squareDiffs.reduce((a: number, b: number) => a + b, 0) / values.length;
  return Math.sqrt(avgSquareDiff);
}

export async function GET() {
  try {
    const datasetPath = path.join(process.cwd(), 'app', 'dataset');
    const files = await fs.readdir(datasetPath);
    const jsonFiles = files.filter((file: string) => file.endsWith('.json'));

    if (jsonFiles.length === 0) {
      return NextResponse.json(
        { error: 'No dataset files found' },
        { status: 404 }
      );
    }

    // Read all dataset files
    const allData: WoundData[] = [];
    for (const file of jsonFiles) {
      try {
        const filePath = path.join(datasetPath, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const data: WoundData = JSON.parse(content);
        allData.push(data);
      } catch (error) {
        console.error(`Error reading file ${file}:`, error);
        continue;
      }
    }

    if (allData.length === 0) {
      return NextResponse.json(
        { error: 'Could not parse any dataset files' },
        { status: 500 }
      );
    }

    // Calculate statistics
    const stats: DatasetStatistics = {
      totalSamples: allData.length,
      tissueDistribution: {
        avgNecrosisPercentage: 0,
        avgSloughPercentage: 0,
        avgRedTissuePercentage: 0,
        stdNecrosisPercentage: 0,
        stdSloughPercentage: 0,
        stdRedTissuePercentage: 0,
      },
      rawScoreAnalysis: {
        avgScores: {
          necrosis: 0,
          slough: 0,
          red_tissue: 0,
        },
        stdScores: {
          necrosis: 0,
          slough: 0,
          red_tissue: 0,
        },
        scoreDistribution: [],
        confidenceMetrics: {
          avgMaxScore: 0,
          avgScoreSpread: 0,
          avgConfidence: 0,
          highConfidenceClusters: 0,
          lowConfidenceClusters: 0,
          ambiguousClusters: 0,
        },
        dominantTissueByScore: {
          necrosis: 0,
          slough: 0,
          red_tissue: 0,
        },
      },
      imageDimensions: {
        avgHeight: 0,
        avgWidth: 0,
        avgArea: 0,
        minHeight: Infinity,
        maxHeight: 0,
        minWidth: Infinity,
        maxWidth: 0,
      },
      superpixelStats: {
        avgSuperpixels: 0,
        minSuperpixels: Infinity,
        maxSuperpixels: 0,
        avgClusters: 0,
        minClusters: Infinity,
        maxClusters: 0,
      },
      tissueTypesByDataset: {},
      percentageDistribution: [],
      clusterSizeDistribution: [],
    };

    // Arrays to store values for std calculation
    const necrosisPercentages: number[] = [];
    const sloughPercentages: number[] = [];
    const redTissuePercentages: number[] = [];

    // Arrays for raw score analysis
    const necrosisScores: number[] = [];
    const sloughScores: number[] = [];
    const redTissueScores: number[] = [];
    const maxScores: number[] = [];
    const scoreSpread: number[] = [];

    // Aggregate data
    let totalNecrosis = 0;
    let totalSlough = 0;
    let totalRedTissue = 0;
    let totalHeight = 0;
    let totalWidth = 0;
    let totalArea = 0;
    let totalSuperpixels = 0;
    let totalClusters = 0;

    // For percentage distribution
    const percentageRanges = {
      necrosis: Array(10).fill(0),
      slough: Array(10).fill(0),
      red_tissue: Array(10).fill(0),
    };

    // For raw score distribution
    const scoreRanges = {
      necrosis: Array(10).fill(0),
      slough: Array(10).fill(0),
      red_tissue: Array(10).fill(0),
    };

    // For cluster size distribution
    const clusterSizes: number[] = [];

    allData.forEach((data: WoundData) => {
      // Tissue percentages
      const necrosisPerc = data.tissue_statistics.percentages.necrosis;
      const sloughPerc = data.tissue_statistics.percentages.slough;
      const redTissuePerc = data.tissue_statistics.percentages.red_tissue;

      totalNecrosis += necrosisPerc;
      totalSlough += sloughPerc;
      totalRedTissue += redTissuePerc;

      necrosisPercentages.push(necrosisPerc);
      sloughPercentages.push(sloughPerc);
      redTissuePercentages.push(redTissuePerc);

      // Percentage distribution
      const necrosisRange = Math.min(Math.floor(necrosisPerc / 10), 9);
      const sloughRange = Math.min(Math.floor(sloughPerc / 10), 9);
      const redTissueRange = Math.min(Math.floor(redTissuePerc / 10), 9);

      percentageRanges.necrosis[necrosisRange]++;
      percentageRanges.slough[sloughRange]++;
      percentageRanges.red_tissue[redTissueRange]++;

      // Image dimensions
      const height = data.image_dimensions.height;
      const width = data.image_dimensions.width;
      const area = height * width;

      totalHeight += height;
      totalWidth += width;
      totalArea += area;

      stats.imageDimensions.minHeight = Math.min(stats.imageDimensions.minHeight, height);
      stats.imageDimensions.maxHeight = Math.max(stats.imageDimensions.maxHeight, height);
      stats.imageDimensions.minWidth = Math.min(stats.imageDimensions.minWidth, width);
      stats.imageDimensions.maxWidth = Math.max(stats.imageDimensions.maxWidth, width);

      // Superpixel stats
      totalSuperpixels += data.num_superpixels;
      totalClusters += data.num_clusters_detected;

      stats.superpixelStats.minSuperpixels = Math.min(
        stats.superpixelStats.minSuperpixels,
        data.num_superpixels
      );
      stats.superpixelStats.maxSuperpixels = Math.max(
        stats.superpixelStats.maxSuperpixels,
        data.num_superpixels
      );
      stats.superpixelStats.minClusters = Math.min(
        stats.superpixelStats.minClusters,
        data.num_clusters_detected
      );
      stats.superpixelStats.maxClusters = Math.max(
        stats.superpixelStats.maxClusters,
        data.num_clusters_detected
      );

      // Dataset-specific tissue types
      const datasetPrefix = data.image_filename.split('_')[0];
      if (!stats.tissueTypesByDataset[datasetPrefix]) {
        stats.tissueTypesByDataset[datasetPrefix] = {
          necrosis: 0,
          slough: 0,
          red_tissue: 0,
          total: 0,
        };
      }

      stats.tissueTypesByDataset[datasetPrefix].necrosis +=
        data.tissue_statistics.pixel_counts.necrosis;
      stats.tissueTypesByDataset[datasetPrefix].slough +=
        data.tissue_statistics.pixel_counts.slough;
      stats.tissueTypesByDataset[datasetPrefix].red_tissue +=
        data.tissue_statistics.pixel_counts.red_tissue;
      stats.tissueTypesByDataset[datasetPrefix].total +=
        data.tissue_statistics.pixel_counts.necrosis +
        data.tissue_statistics.pixel_counts.slough +
        data.tissue_statistics.pixel_counts.red_tissue;

      // Cluster sizes and raw score analysis
      data.clusters.forEach((cluster) => {
        clusterSizes.push(cluster.pixel_count);

        // Extract raw scores
        const necScore = cluster.scores.necrosis;
        const sloScore = cluster.scores.slough;
        const redScore = cluster.scores.red_tissue;

        necrosisScores.push(necScore);
        sloughScores.push(sloScore);
        redTissueScores.push(redScore);

        // Calculate confidence metrics
        const scores = [necScore, sloScore, redScore];
        const maxScore = Math.max(...scores);
        const minScore = Math.min(...scores);
        const spread = maxScore - minScore;

        maxScores.push(maxScore);
        scoreSpread.push(spread);

        // Determine dominant tissue by raw score
        if (necScore >= sloScore && necScore >= redScore) {
          stats.rawScoreAnalysis.dominantTissueByScore.necrosis++;
        } else if (sloScore >= necScore && sloScore >= redScore) {
          stats.rawScoreAnalysis.dominantTissueByScore.slough++;
        } else {
          stats.rawScoreAnalysis.dominantTissueByScore.red_tissue++;
        }

        // Confidence classification
        if (maxScore >= 0.7) {
          stats.rawScoreAnalysis.confidenceMetrics.highConfidenceClusters++;
        } else if (maxScore < 0.4) {
          stats.rawScoreAnalysis.confidenceMetrics.lowConfidenceClusters++;
        }

        // Ambiguous clusters (scores are close)
        if (spread < 0.2) {
          stats.rawScoreAnalysis.confidenceMetrics.ambiguousClusters++;
        }

        // Score distribution (0.0-0.1, 0.1-0.2, etc.)
        const necBin = Math.min(Math.floor(necScore * 10), 9);
        const sloBin = Math.min(Math.floor(sloScore * 10), 9);
        const redBin = Math.min(Math.floor(redScore * 10), 9);

        scoreRanges.necrosis[necBin]++;
        scoreRanges.slough[sloBin]++;
        scoreRanges.red_tissue[redBin]++;
      });
    });

    // Calculate averages
    const n = allData.length;
    stats.tissueDistribution.avgNecrosisPercentage = totalNecrosis / n;
    stats.tissueDistribution.avgSloughPercentage = totalSlough / n;
    stats.tissueDistribution.avgRedTissuePercentage = totalRedTissue / n;

    // Calculate standard deviations
    stats.tissueDistribution.stdNecrosisPercentage = calculateStandardDeviation(
      necrosisPercentages,
      stats.tissueDistribution.avgNecrosisPercentage
    );
    stats.tissueDistribution.stdSloughPercentage = calculateStandardDeviation(
      sloughPercentages,
      stats.tissueDistribution.avgSloughPercentage
    );
    stats.tissueDistribution.stdRedTissuePercentage = calculateStandardDeviation(
      redTissuePercentages,
      stats.tissueDistribution.avgRedTissuePercentage
    );

    stats.imageDimensions.avgHeight = totalHeight / n;
    stats.imageDimensions.avgWidth = totalWidth / n;
    stats.imageDimensions.avgArea = totalArea / n;

    stats.superpixelStats.avgSuperpixels = totalSuperpixels / n;
    stats.superpixelStats.avgClusters = totalClusters / n;

    // Calculate raw score statistics
    const totalClusterCount = necrosisScores.length;
    stats.rawScoreAnalysis.avgScores.necrosis =
      necrosisScores.reduce((a: number, b: number) => a + b, 0) / totalClusterCount;
    stats.rawScoreAnalysis.avgScores.slough =
      sloughScores.reduce((a: number, b: number) => a + b, 0) / totalClusterCount;
    stats.rawScoreAnalysis.avgScores.red_tissue =
      redTissueScores.reduce((a: number, b: number) => a + b, 0) / totalClusterCount;

    stats.rawScoreAnalysis.stdScores.necrosis = calculateStandardDeviation(
      necrosisScores,
      stats.rawScoreAnalysis.avgScores.necrosis
    );
    stats.rawScoreAnalysis.stdScores.slough = calculateStandardDeviation(
      sloughScores,
      stats.rawScoreAnalysis.avgScores.slough
    );
    stats.rawScoreAnalysis.stdScores.red_tissue = calculateStandardDeviation(
      redTissueScores,
      stats.rawScoreAnalysis.avgScores.red_tissue
    );

    // Confidence metrics
    stats.rawScoreAnalysis.confidenceMetrics.avgMaxScore =
      maxScores.reduce((a: number, b: number) => a + b, 0) / totalClusterCount;
    stats.rawScoreAnalysis.confidenceMetrics.avgScoreSpread =
      scoreSpread.reduce((a: number, b: number) => a + b, 0) / totalClusterCount;
    stats.rawScoreAnalysis.confidenceMetrics.avgConfidence =
      stats.rawScoreAnalysis.confidenceMetrics.avgMaxScore;

    // Build percentage distribution array
    for (let i = 0; i < 10; i++) {
      stats.percentageDistribution.push({
        range: `${i * 10}-${(i + 1) * 10}%`,
        necrosis: percentageRanges.necrosis[i],
        slough: percentageRanges.slough[i],
        red_tissue: percentageRanges.red_tissue[i],
      });
    }

    // Build raw score distribution array
    for (let i = 0; i < 10; i++) {
      const lowerBound = (i / 10).toFixed(1);
      const upperBound = ((i + 1) / 10).toFixed(1);
      stats.rawScoreAnalysis.scoreDistribution.push({
        range: `${lowerBound}-${upperBound}`,
        necrosis: scoreRanges.necrosis[i],
        slough: scoreRanges.slough[i],
        red_tissue: scoreRanges.red_tissue[i],
      });
    }

    // Build cluster size distribution
    clusterSizes.sort((a: number, b: number) => a - b);
    const clusterRanges = [0, 100, 500, 1000, 5000, 10000, Infinity];
    const clusterCounts = Array(clusterRanges.length - 1).fill(0);

    clusterSizes.forEach((size: number) => {
      for (let i = 0; i < clusterRanges.length - 1; i++) {
        if (size >= clusterRanges[i] && size < clusterRanges[i + 1]) {
          clusterCounts[i]++;
          break;
        }
      }
    });

    for (let i = 0; i < clusterCounts.length; i++) {
      const rangeLabel =
        clusterRanges[i + 1] === Infinity
          ? `${clusterRanges[i]}+`
          : `${clusterRanges[i]}-${clusterRanges[i + 1]}`;

      stats.clusterSizeDistribution.push({
        range: rangeLabel,
        count: clusterCounts[i],
      });
    }

    return NextResponse.json(stats);
  } catch (error) {
    console.error('Error calculating statistics:', error);
    return NextResponse.json(
      { error: 'Failed to calculate statistics' },
      { status: 500 }
    );
  }
}

