"use client"

import * as React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from "@/components/ui/chart"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"

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

function CalculationExplanation({ title, description }: { title: string; description: string }) {
  return (
    <div className="mt-4 rounded-lg bg-muted/50 p-3 text-sm">
      <div className="font-semibold text-muted-foreground mb-1">{title}</div>
      <div className="text-muted-foreground leading-relaxed whitespace-pre-line">{description}</div>
    </div>
  )
}

export default function DashboardPage() {
  const [stats, setStats] = React.useState<DatasetStatistics | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    async function fetchStatistics() {
      try {
        const response = await fetch('/api/dataset-statistics')
        if (!response.ok) {
          throw new Error('Failed to fetch statistics')
        }
        const data = await response.json()
        setStats(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    fetchStatistics()
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-lg">Loading statistics...</div>
      </div>
    )
  }

  if (error || !stats) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-lg text-destructive">Error: {error || 'No data available'}</div>
      </div>
    )
  }

  // Prepare data for charts
  const tissueDistributionData = [
    {
      name: "Necrosis",
      value: stats.tissueDistribution.avgNecrosisPercentage,
      std: stats.tissueDistribution.stdNecrosisPercentage,
      fill: "#000000",
    },
    {
      name: "Slough",
      value: stats.tissueDistribution.avgSloughPercentage,
      std: stats.tissueDistribution.stdSloughPercentage,
      fill: "#EAB308",
    },
    {
      name: "Red Tissue",
      value: stats.tissueDistribution.avgRedTissuePercentage,
      std: stats.tissueDistribution.stdRedTissuePercentage,
      fill: "#DC2626",
    },
  ]

  const datasetComparisonData = Object.entries(stats.tissueTypesByDataset).map(([dataset, data]) => ({
    dataset: dataset.toUpperCase(),
    necrosis: ((data.necrosis / data.total) * 100).toFixed(2),
    slough: ((data.slough / data.total) * 100).toFixed(2),
    red_tissue: ((data.red_tissue / data.total) * 100).toFixed(2),
  }))

  const imageDimensionsData = [
    { metric: "Min", height: stats.imageDimensions.minHeight, width: stats.imageDimensions.minWidth },
    { metric: "Avg", height: Math.round(stats.imageDimensions.avgHeight), width: Math.round(stats.imageDimensions.avgWidth) },
    { metric: "Max", height: stats.imageDimensions.maxHeight, width: stats.imageDimensions.maxWidth },
  ]

  const chartConfig = {
    necrosis: {
      label: "Necrosis",
      color: "#000000",
    },
    slough: {
      label: "Slough",
      color: "#EAB308",
    },
    red_tissue: {
      label: "Red Tissue",
      color: "#DC2626",
    },
    height: {
      label: "Height",
      color: "#3B82F6",
    },
    width: {
      label: "Width",
      color: "#8B5CF6",
    },
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-7xl space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">Wound Dataset Statistics Dashboard</h1>
          <p className="text-muted-foreground text-lg">
            Comprehensive statistical analysis of {stats.totalSamples} wound tissue samples
          </p>
        </div>

        <Separator />

        {/* Overview Cards */}
        <div className="grid gap-6 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Total Samples</CardTitle>
              <CardDescription>Complete dataset size</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold">{stats.totalSamples}</div>
              <p className="text-muted-foreground text-sm mt-2">Analyzed wound images</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Avg. Image Resolution</CardTitle>
              <CardDescription>Mean dimensions across dataset</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold">
                {Math.round(stats.imageDimensions.avgWidth)} × {Math.round(stats.imageDimensions.avgHeight)}
              </div>
              <p className="text-muted-foreground text-sm mt-2">
                Area: {Math.round(stats.imageDimensions.avgArea).toLocaleString()} px²
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Avg. Clusters</CardTitle>
              <CardDescription>Segmentation granularity</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold">{stats.superpixelStats.avgClusters.toFixed(1)}</div>
              <p className="text-muted-foreground text-sm mt-2">
                Range: {stats.superpixelStats.minClusters} - {stats.superpixelStats.maxClusters}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Tissue Distribution - Mean and Standard Deviation */}
        <Card>
          <CardHeader>
            <CardTitle>Mean Tissue Type Distribution</CardTitle>
            <CardDescription>
              Average percentage composition with standard deviation (n={stats.totalSamples})
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[400px]">
              <BarChart data={tissueDistributionData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis label={{ value: 'Percentage (%)', angle: -90, position: 'insideLeft' }} />
                <ChartTooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload
                      return (
                        <div className="rounded-lg border bg-background p-2 shadow-sm">
                          <div className="font-semibold">{data.name}</div>
                          <div className="text-sm">Mean: {data.value.toFixed(2)}%</div>
                          <div className="text-sm">Std Dev: ±{data.std.toFixed(2)}%</div>
                        </div>
                      )
                    }
                    return null
                  }}
                />
                <Bar dataKey="value" fill="#000000" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ChartContainer>

            <CalculationExplanation
              title="📊 How This Was Calculated"
              description={`JSON Fields Used:
• tissue_statistics.percentages.necrosis
• tissue_statistics.percentages.slough
• tissue_statistics.percentages.red_tissue

Pseudocode:
FOR each sample in dataset:
    Extract necrosis_percentage, slough_percentage, red_tissue_percentage
    Add to respective arrays

Calculate mean:
    mean_necrosis = SUM(necrosis_percentages) / total_samples
    mean_slough = SUM(slough_percentages) / total_samples
    mean_red_tissue = SUM(red_tissue_percentages) / total_samples

Calculate standard deviation:
    FOR each tissue type:
        variance = SUM((value - mean)²) / total_samples
        std_dev = SQRT(variance)

Interpretation: Standard deviation indicates variability in tissue composition across samples. Higher std dev suggests more heterogeneous wound presentations.`}
            />
          </CardContent>
        </Card>

        {/* Raw Color Analysis - Average Scores */}
        <Card>
          <CardHeader>
            <CardTitle>Raw Color Analysis - Mean Cluster Scores</CardTitle>
            <CardDescription>
              Average tissue scores across all clusters (underlying values before classification)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[400px]">
              <BarChart
                data={[
                  {
                    name: "Necrosis",
                    value: stats.rawScoreAnalysis.avgScores.necrosis,
                    std: stats.rawScoreAnalysis.stdScores.necrosis,
                    fill: "#000000",
                  },
                  {
                    name: "Slough",
                    value: stats.rawScoreAnalysis.avgScores.slough,
                    std: stats.rawScoreAnalysis.stdScores.slough,
                    fill: "#EAB308",
                  },
                  {
                    name: "Red Tissue",
                    value: stats.rawScoreAnalysis.avgScores.red_tissue,
                    std: stats.rawScoreAnalysis.stdScores.red_tissue,
                    fill: "#DC2626",
                  },
                ]}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis
                  label={{ value: 'Score (0-1)', angle: -90, position: 'insideLeft' }}
                  domain={[0, 1]}
                />
                <ChartTooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload
                      return (
                        <div className="rounded-lg border bg-background p-2 shadow-sm">
                          <div className="font-semibold">{data.name}</div>
                          <div className="text-sm">Mean: {data.value.toFixed(3)}</div>
                          <div className="text-sm">Std Dev: ±{data.std.toFixed(3)}</div>
                        </div>
                      )
                    }
                    return null
                  }}
                />
                <Bar dataKey="value" fill="#000000" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ChartContainer>

            <CalculationExplanation
              title="📊 How This Was Calculated"
              description={`JSON Fields Used:
• clusters[i].scores.necrosis
• clusters[i].scores.slough
• clusters[i].scores.red_tissue

Pseudocode:
Initialize score_arrays = {necrosis: [], slough: [], red_tissue: []}

FOR each sample in dataset:
    FOR each cluster in sample.clusters:
        score_arrays.necrosis.APPEND(cluster.scores.necrosis)
        score_arrays.slough.APPEND(cluster.scores.slough)
        score_arrays.red_tissue.APPEND(cluster.scores.red_tissue)

Calculate mean scores:
    mean_necrosis = SUM(score_arrays.necrosis) / total_clusters
    mean_slough = SUM(score_arrays.slough) / total_clusters
    mean_red_tissue = SUM(score_arrays.red_tissue) / total_clusters

Calculate standard deviation:
    FOR each tissue type:
        variance = SUM((score - mean)²) / total_clusters
        std_dev = SQRT(variance)

Interpretation: These are the RAW scores from the color analysis algorithm, NOT the final classifications. Scores range from 0 to 1. The tissue_type classification is determined by which score is highest, but all three scores are used in the visualization overlay to create blended colors. Lower standard deviations indicate consistent scoring patterns across the dataset.`}
            />
          </CardContent>
        </Card>

        {/* Raw Score Distribution Histogram */}
        <Card>
          <CardHeader>
            <CardTitle>Raw Score Distribution</CardTitle>
            <CardDescription>
              Frequency distribution of cluster scores by value range (0.0-1.0)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[400px]">
              <BarChart data={stats.rawScoreAnalysis.scoreDistribution}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="range" />
                <YAxis label={{ value: 'Number of Clusters', angle: -90, position: 'insideLeft' }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="necrosis" fill="#000000" />
                <Bar dataKey="slough" fill="#EAB308" />
                <Bar dataKey="red_tissue" fill="#DC2626" />
              </BarChart>
            </ChartContainer>

            <CalculationExplanation
              title="📊 How This Was Calculated"
              description={`JSON Fields Used:
• clusters[i].scores.necrosis
• clusters[i].scores.slough
• clusters[i].scores.red_tissue

Pseudocode:
Define score_bins = 10  // For ranges 0.0-0.1, 0.1-0.2, ..., 0.9-1.0
Initialize histogram = {
    necrosis: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    slough: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    red_tissue: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
}

FOR each sample in dataset:
    FOR each cluster in sample.clusters:
        necrosis_bin = FLOOR(cluster.scores.necrosis × 10)  // e.g., 0.45 → bin 4
        slough_bin = FLOOR(cluster.scores.slough × 10)
        red_tissue_bin = FLOOR(cluster.scores.red_tissue × 10)
        
        // Ensure bin index is 0-9
        necrosis_bin = MIN(necrosis_bin, 9)
        slough_bin = MIN(slough_bin, 9)
        red_tissue_bin = MIN(red_tissue_bin, 9)
        
        histogram.necrosis[necrosis_bin] += 1
        histogram.slough[slough_bin] += 1
        histogram.red_tissue[red_tissue_bin] += 1

Interpretation: This shows the distribution of RAW scores, not final classifications. Scores closer to 1.0 indicate higher confidence for that tissue type. A peak at low scores (0.0-0.3) suggests many clusters with low activation for that tissue. Multiple peaks may indicate bimodal scoring patterns. This is crucial for understanding the color blending used in visualization overlays.`}
            />
          </CardContent>
        </Card>

        {/* Confidence Metrics */}
        <Card>
          <CardHeader>
            <CardTitle>Confidence & Ambiguity Analysis</CardTitle>
            <CardDescription>
              Classification certainty and score separation metrics
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <span className="font-medium">Avg. Max Score</span>
                  <Badge variant="secondary" className="text-lg">
                    {stats.rawScoreAnalysis.confidenceMetrics.avgMaxScore.toFixed(3)}
                  </Badge>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <span className="font-medium">Avg. Score Spread</span>
                  <Badge variant="secondary" className="text-lg">
                    {stats.rawScoreAnalysis.confidenceMetrics.avgScoreSpread.toFixed(3)}
                  </Badge>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <span className="font-medium">High Confidence</span>
                  <Badge variant="outline">
                    {stats.rawScoreAnalysis.confidenceMetrics.highConfidenceClusters.toLocaleString()} clusters
                  </Badge>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <span className="font-medium">Low Confidence</span>
                  <Badge variant="outline">
                    {stats.rawScoreAnalysis.confidenceMetrics.lowConfidenceClusters.toLocaleString()} clusters
                  </Badge>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <span className="font-medium">Ambiguous</span>
                  <Badge variant="outline">
                    {stats.rawScoreAnalysis.confidenceMetrics.ambiguousClusters.toLocaleString()} clusters
                  </Badge>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <span className="font-medium">Confidence Rate</span>
                  <Badge variant="secondary" className="text-lg">
                    {(
                      (stats.rawScoreAnalysis.confidenceMetrics.highConfidenceClusters /
                        (stats.rawScoreAnalysis.dominantTissueByScore.necrosis +
                          stats.rawScoreAnalysis.dominantTissueByScore.slough +
                          stats.rawScoreAnalysis.dominantTissueByScore.red_tissue)) *
                      100
                    ).toFixed(1)}
                    %
                  </Badge>
                </div>
              </div>
            </div>

            <CalculationExplanation
              title="📊 How This Was Calculated"
              description={`JSON Fields Used:
• clusters[i].scores.necrosis
• clusters[i].scores.slough
• clusters[i].scores.red_tissue

Pseudocode:
Initialize counters and arrays

FOR each sample in dataset:
    FOR each cluster in sample.clusters:
        scores = [cluster.scores.necrosis, cluster.scores.slough, cluster.scores.red_tissue]
        max_score = MAX(scores)
        min_score = MIN(scores)
        spread = max_score - min_score
        
        // Collect metrics
        max_scores.APPEND(max_score)
        spreads.APPEND(spread)
        
        // Classify confidence
        IF max_score >= 0.7:
            high_confidence_count += 1
        ELSE IF max_score < 0.4:
            low_confidence_count += 1
        
        // Detect ambiguity
        IF spread < 0.2:  // Scores are very close
            ambiguous_count += 1

Calculate averages:
    avg_max_score = SUM(max_scores) / total_clusters
    avg_spread = SUM(spreads) / total_clusters
    confidence_rate = (high_confidence_count / total_clusters) × 100

Interpretation:
• Max Score: Highest of the three tissue scores. Values closer to 1.0 indicate strong classification.
• Score Spread: Difference between highest and lowest scores. Higher spread = clearer distinction.
• High Confidence: Clusters with max_score ≥ 0.7 (strong tissue signal).
• Low Confidence: Clusters with max_score < 0.4 (weak tissue signal).
• Ambiguous: Clusters where all three scores are similar (spread < 0.2), making classification uncertain.
• Confidence Rate: Percentage of clusters with definitive classifications.

This analysis is critical for understanding classification reliability and identifying regions requiring manual review.`}
            />
          </CardContent>
        </Card>

        {/* Dominant Tissue Comparison */}
        <Card>
          <CardHeader>
            <CardTitle>Classification Comparison: Final vs Raw Scores</CardTitle>
            <CardDescription>
              Comparing tissue classification (highest score) with pixel-based distribution
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[400px]">
              <BarChart
                data={[
                  {
                    type: "By Highest Score",
                    necrosis: stats.rawScoreAnalysis.dominantTissueByScore.necrosis,
                    slough: stats.rawScoreAnalysis.dominantTissueByScore.slough,
                    red_tissue: stats.rawScoreAnalysis.dominantTissueByScore.red_tissue,
                  },
                  {
                    type: "By Pixel Count",
                    necrosis: Math.round(
                      (stats.tissueDistribution.avgNecrosisPercentage *
                        stats.superpixelStats.avgClusters) /
                        100
                    ),
                    slough: Math.round(
                      (stats.tissueDistribution.avgSloughPercentage *
                        stats.superpixelStats.avgClusters) /
                        100
                    ),
                    red_tissue: Math.round(
                      (stats.tissueDistribution.avgRedTissuePercentage *
                        stats.superpixelStats.avgClusters) /
                        100
                    ),
                  },
                ]}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="type" />
                <YAxis label={{ value: 'Avg. Clusters per Sample', angle: -90, position: 'insideLeft' }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="necrosis" fill="#000000" />
                <Bar dataKey="slough" fill="#EAB308" />
                <Bar dataKey="red_tissue" fill="#DC2626" />
              </BarChart>
            </ChartContainer>

            <CalculationExplanation
              title="📊 How This Was Calculated"
              description={`JSON Fields Used:
• clusters[i].scores.necrosis, slough, red_tissue (for "By Highest Score")
• clusters[i].tissue_type (for "By Pixel Count")
• tissue_statistics.percentages.* (for comparison)

Pseudocode:
// Method 1: Classification by highest raw score
Initialize score_based_counts = {necrosis: 0, slough: 0, red_tissue: 0}

FOR each sample in dataset:
    FOR each cluster in sample.clusters:
        scores = cluster.scores
        highest = MAX(scores.necrosis, scores.slough, scores.red_tissue)
        
        IF highest == scores.necrosis:
            score_based_counts.necrosis += 1
        ELSE IF highest == scores.slough:
            score_based_counts.slough += 1
        ELSE:
            score_based_counts.red_tissue += 1

// Method 2: Classification by pixel statistics
// This uses the pre-computed tissue_statistics which is based on
// pixel counts weighted by cluster sizes

Interpretation: This comparison reveals the relationship between the RAW color analysis scores and the FINAL pixel-based tissue distribution. Discrepancies indicate:
• Small clusters with high scores vs large clusters with lower scores
• Weighting effects of cluster size on overall statistics
• The impact of spatial distribution on tissue quantification

Both metrics are valid but serve different purposes:
- "By Highest Score" treats each cluster equally (cluster-level classification)
- "By Pixel Count" weights by cluster size (pixel-level quantification)

Your visualization uses the raw scores for color blending, while the statistics use pixel counts for area measurements.`}
            />
          </CardContent>
        </Card>

        {/* Tissue Distribution by Dataset Source */}
        <Card>
          <CardHeader>
            <CardTitle>Tissue Distribution by Dataset Source</CardTitle>
            <CardDescription>
              Comparative analysis of tissue composition across different data sources
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[400px]">
              <BarChart data={datasetComparisonData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="dataset" />
                <YAxis label={{ value: 'Percentage (%)', angle: -90, position: 'insideLeft' }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="necrosis" fill="#000000" stackId="a" />
                <Bar dataKey="slough" fill="#EAB308" stackId="a" />
                <Bar dataKey="red_tissue" fill="#DC2626" stackId="a" />
              </BarChart>
            </ChartContainer>

            <CalculationExplanation
              title="📊 How This Was Calculated"
              description={`JSON Fields Used:
• image_filename (to extract dataset prefix)
• tissue_statistics.pixel_counts.necrosis
• tissue_statistics.pixel_counts.slough
• tissue_statistics.pixel_counts.red_tissue

Pseudocode:
Initialize dataset_groups = {}

FOR each sample in dataset:
    dataset_prefix = EXTRACT_PREFIX(image_filename)  // e.g., "fusc", "medetec", "wsnet"
    
    IF dataset_prefix NOT IN dataset_groups:
        dataset_groups[dataset_prefix] = {necrosis: 0, slough: 0, red_tissue: 0, total: 0}
    
    dataset_groups[dataset_prefix].necrosis += pixel_counts.necrosis
    dataset_groups[dataset_prefix].slough += pixel_counts.slough
    dataset_groups[dataset_prefix].red_tissue += pixel_counts.red_tissue
    dataset_groups[dataset_prefix].total += (necrosis + slough + red_tissue)

FOR each dataset in dataset_groups:
    necrosis_percent = (dataset.necrosis / dataset.total) × 100
    slough_percent = (dataset.slough / dataset.total) × 100
    red_tissue_percent = (dataset.red_tissue / dataset.total) × 100

Interpretation: Reveals systematic differences in wound characteristics between data sources, potentially reflecting different patient populations, wound etiologies, or imaging protocols.`}
            />
          </CardContent>
        </Card>

        {/* Percentage Distribution Histogram */}
        <Card>
          <CardHeader>
            <CardTitle>Tissue Percentage Distribution</CardTitle>
            <CardDescription>
              Histogram showing frequency of samples in each percentage range
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[400px]">
              <BarChart data={stats.percentageDistribution}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="range" />
                <YAxis label={{ value: 'Number of Samples', angle: -90, position: 'insideLeft' }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="necrosis" fill="#000000" />
                <Bar dataKey="slough" fill="#EAB308" />
                <Bar dataKey="red_tissue" fill="#DC2626" />
              </BarChart>
            </ChartContainer>

            <CalculationExplanation
              title="📊 How This Was Calculated"
              description={`JSON Fields Used:
• tissue_statistics.percentages.necrosis
• tissue_statistics.percentages.slough
• tissue_statistics.percentages.red_tissue

Pseudocode:
Initialize histogram_bins = {
    necrosis: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],  // 10 bins for 0-10%, 10-20%, ..., 90-100%
    slough: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    red_tissue: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
}

FOR each sample in dataset:
    necrosis_bin = FLOOR(sample.percentages.necrosis / 10)  // e.g., 45% → bin 4
    slough_bin = FLOOR(sample.percentages.slough / 10)
    red_tissue_bin = FLOOR(sample.percentages.red_tissue / 10)
    
    // Ensure bin index is 0-9
    necrosis_bin = MIN(necrosis_bin, 9)
    slough_bin = MIN(slough_bin, 9)
    red_tissue_bin = MIN(red_tissue_bin, 9)
    
    histogram_bins.necrosis[necrosis_bin] += 1
    histogram_bins.slough[slough_bin] += 1
    histogram_bins.red_tissue[red_tissue_bin] += 1

Interpretation: This histogram reveals the statistical distribution shape. Normal distributions suggest homogeneous populations, while multimodal distributions may indicate distinct wound subtypes. Skewness indicates predominance of certain tissue types.`}
            />
          </CardContent>
        </Card>

        {/* Image Dimensions Comparison */}
        <Card>
          <CardHeader>
            <CardTitle>Image Dimension Statistics</CardTitle>
            <CardDescription>
              Minimum, average, and maximum dimensions across dataset
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[400px]">
              <BarChart data={imageDimensionsData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="metric" />
                <YAxis label={{ value: 'Pixels', angle: -90, position: 'insideLeft' }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="height" fill="var(--color-height)" />
                <Bar dataKey="width" fill="var(--color-width)" />
              </BarChart>
            </ChartContainer>

            <CalculationExplanation
              title="📊 How This Was Calculated"
              description={`JSON Fields Used:
• image_dimensions.height
• image_dimensions.width

Pseudocode:
Initialize:
    min_height = INFINITY
    max_height = 0
    sum_height = 0
    min_width = INFINITY
    max_width = 0
    sum_width = 0

FOR each sample in dataset:
    height = sample.image_dimensions.height
    width = sample.image_dimensions.width
    
    min_height = MIN(min_height, height)
    max_height = MAX(max_height, height)
    sum_height += height
    
    min_width = MIN(min_width, width)
    max_width = MAX(max_width, width)
    sum_width += width

avg_height = sum_height / total_samples
avg_width = sum_width / total_samples

Also calculated:
    area = height × width
    avg_area = sum_areas / total_samples

Interpretation: Dimension variability affects segmentation algorithms. Large variations suggest need for preprocessing normalization or resolution-adaptive parameters.`}
            />
          </CardContent>
        </Card>

        {/* Cluster Size Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Cluster Size Distribution</CardTitle>
            <CardDescription>
              Frequency distribution of cluster sizes by pixel count
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[400px]">
              <BarChart data={stats.clusterSizeDistribution}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="range" />
                <YAxis label={{ value: 'Number of Clusters', angle: -90, position: 'insideLeft' }} />
                <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                <Bar dataKey="count" fill="#6B7280" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ChartContainer>

            <CalculationExplanation
              title="📊 How This Was Calculated"
              description={`JSON Fields Used:
• clusters (array of cluster objects)
• clusters[i].pixel_count

Pseudocode:
Define size_ranges = [0, 100, 500, 1000, 5000, 10000, INFINITY]
Initialize range_counts = [0, 0, 0, 0, 0, 0]  // One less than ranges

FOR each sample in dataset:
    FOR each cluster in sample.clusters:
        pixel_count = cluster.pixel_count
        
        // Find which range this cluster belongs to
        FOR i from 0 to (length(size_ranges) - 2):
            IF pixel_count >= size_ranges[i] AND pixel_count < size_ranges[i+1]:
                range_counts[i] += 1
                BREAK

Create labels:
    "0-100", "100-500", "500-1000", "1000-5000", "5000-10000", "10000+"

Interpretation: Cluster size distribution reflects segmentation granularity and tissue heterogeneity. Predominance of small clusters suggests fine-grained texture, while large clusters indicate homogeneous tissue regions. This metric is crucial for understanding the spatial scale of tissue differentiation captured by the segmentation algorithm.`}
            />
          </CardContent>
        </Card>

        {/* Superpixel Statistics */}
        <Card>
          <CardHeader>
            <CardTitle>Superpixel & Cluster Analysis</CardTitle>
            <CardDescription>
              Segmentation parameters and detected structure statistics
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <span className="font-medium">Avg. Superpixels</span>
                  <Badge variant="secondary" className="text-lg">
                    {stats.superpixelStats.avgSuperpixels.toFixed(1)}
                  </Badge>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <span className="font-medium">Min Superpixels</span>
                  <Badge variant="outline">{stats.superpixelStats.minSuperpixels}</Badge>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <span className="font-medium">Max Superpixels</span>
                  <Badge variant="outline">{stats.superpixelStats.maxSuperpixels}</Badge>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <span className="font-medium">Avg. Clusters</span>
                  <Badge variant="secondary" className="text-lg">
                    {stats.superpixelStats.avgClusters.toFixed(1)}
                  </Badge>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <span className="font-medium">Min Clusters</span>
                  <Badge variant="outline">{stats.superpixelStats.minClusters}</Badge>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <span className="font-medium">Max Clusters</span>
                  <Badge variant="outline">{stats.superpixelStats.maxClusters}</Badge>
                </div>
              </div>
            </div>

            <CalculationExplanation
              title="📊 How This Was Calculated"
              description={`JSON Fields Used:
• num_superpixels
• num_clusters_detected

Pseudocode:
Initialize:
    sum_superpixels = 0
    min_superpixels = INFINITY
    max_superpixels = 0
    sum_clusters = 0
    min_clusters = INFINITY
    max_clusters = 0

FOR each sample in dataset:
    superpixels = sample.num_superpixels
    clusters = sample.num_clusters_detected
    
    sum_superpixels += superpixels
    min_superpixels = MIN(min_superpixels, superpixels)
    max_superpixels = MAX(max_superpixels, superpixels)
    
    sum_clusters += clusters
    min_clusters = MIN(min_clusters, clusters)
    max_clusters = MAX(max_clusters, clusters)

avg_superpixels = sum_superpixels / total_samples
avg_clusters = sum_clusters / total_samples

Interpretation:
• Superpixels: Initial over-segmentation units from SLIC algorithm. More superpixels = finer initial segmentation.
• Clusters: Final tissue regions after merging similar superpixels. Fewer clusters than superpixels indicates successful grouping.
• Ratio (superpixels/clusters): Measures segmentation consolidation efficiency. Higher ratios suggest more successful merging of similar regions.`}
            />
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="rounded-lg border bg-muted/50 p-6 text-center">
          <p className="text-muted-foreground text-sm">
            Statistical analysis generated from {stats.totalSamples} wound tissue samples.
            All metrics use descriptive statistics appropriate for medical imaging datasets.
          </p>
          <p className="text-muted-foreground text-xs mt-2">
            Dashboard updates automatically when dataset changes are detected.
          </p>
        </div>
      </div>
    </div>
  )
}

