export interface ImageDimensions {
  height: number;
  width: number;
}

export interface TissueStatistics {
  counts: {
    necrosis: number;
    slough: number;
    red_tissue: number;
  };
  pixel_counts: {
    necrosis: number;
    slough: number;
    red_tissue: number;
  };
  percentages: {
    necrosis: number;
    slough: number;
    red_tissue: number;
  };
}

export interface ClusterScores {
  necrosis: number;
  slough: number;
  red_tissue: number;
}

export interface Cluster {
  cluster_id: number;
  tissue_type: 'necrosis' | 'slough' | 'red_tissue';
  center_y: number;
  center_x: number;
  pixel_count: number;
  scores: ClusterScores;
  cluster_bgr_pixels: number[][];
}

export interface WoundData {
  image_filename: string;
  mask_filename: string;
  processing_index: number;
  image_dimensions: ImageDimensions;
  num_superpixels: number;
  num_clusters_detected: number;
  tissue_statistics: TissueStatistics;
  img_bgr: number[][][];
  mask_bgr: number[][];
  labels: number[][];
  clusters: Cluster[];
}

