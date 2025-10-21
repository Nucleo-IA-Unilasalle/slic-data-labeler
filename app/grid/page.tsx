'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Filter, ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { WoundData } from '@/lib/types/wound-data';

interface SampleThumbnail {
  filename: string;
  isReviewed: boolean;
  isSeen: boolean;
  woundData: WoundData | null;
}

const ITEMS_PER_PAGE = 24;

export default function GridPage() {
  const [dataFiles, setDataFiles] = useState<string[]>([]);
  const [samples, setSamples] = useState<SampleThumbnail[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'none' | 'necrosis' | 'slough' | 'red_tissue'>('none');
  const [seenFiles, setSeenFiles] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Load seen files from localStorage
  useEffect(() => {
    const storedSeenFiles = localStorage.getItem('seenFiles');
    if (storedSeenFiles) {
      try {
        const parsed = JSON.parse(storedSeenFiles);
        setSeenFiles(new Set(parsed));
      } catch (err) {
        console.error('Failed to parse seen files from localStorage:', err);
      }
    }
  }, []);

  // Fetch data files when sort changes
  useEffect(() => {
    async function fetchDataFiles() {
      try {
        setIsLoading(true);
        const url = sortBy === 'none' 
          ? '/api/data-files'
          : `/api/data-files-sorted?sortBy=${sortBy}`;
        
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error('Failed to fetch data files');
        }
        const data = await response.json();
        setDataFiles(data.files);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data files');
      } finally {
        setIsLoading(false);
      }
    }
    
    fetchDataFiles();
  }, [sortBy]);

  // Load sample data for current page
  useEffect(() => {
    if (dataFiles.length === 0) return;

    async function loadSamples() {
      setIsLoading(true);
      
      // Calculate pagination
      const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
      const endIdx = startIdx + ITEMS_PER_PAGE;
      const pageFiles = dataFiles.slice(startIdx, endIdx);
      
      try {
        // Fetch all data in one request
        const response = await fetch('/api/data-files-bulk', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ filenames: pageFiles }),
        });

        if (!response.ok) {
          throw new Error('Failed to fetch bulk data');
        }

        const data = await response.json();
        
        // Map results to samples
        const loadedSamples: SampleThumbnail[] = data.results.map((result: {
          filename: string;
          woundData: WoundData | null;
          isReviewed: boolean;
          error: string | null;
        }) => ({
          filename: result.filename,
          isReviewed: result.isReviewed,
          isSeen: seenFiles.has(result.filename),
          woundData: result.woundData,
        }));
        
        setSamples(loadedSamples);
      } catch (err) {
        console.error('Failed to load samples:', err);
        setError(err instanceof Error ? err.message : 'Failed to load samples');
        
        // Fallback to empty samples
        setSamples(pageFiles.map((file) => ({
          filename: file,
          isReviewed: false,
          isSeen: seenFiles.has(file),
          woundData: null,
        })));
      } finally {
        setIsLoading(false);
      }
    }

    loadSamples();
  }, [dataFiles, seenFiles, currentPage]);

  const handleSortChange = (newSort: 'none' | 'necrosis' | 'slough' | 'red_tissue'): void => {
    setSortBy(newSort);
    setCurrentPage(1);
    const sortLabels = {
      none: 'Default order',
      necrosis: 'Most necrosis',
      slough: 'Most slough',
      red_tissue: 'Most red tissue'
    };
    toast.success(`Sorted by: ${sortLabels[newSort]}`);
  };

  const sortLabels = {
    none: 'No Filter',
    necrosis: 'Most Necrosis',
    slough: 'Most Slough',
    red_tissue: 'Most Red Tissue'
  };

  const totalPages = Math.ceil(dataFiles.length / ITEMS_PER_PAGE);

  const handlePreviousPage = (): void => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleNextPage = (): void => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handlePageSelect = (pageStr: string): void => {
    const page = parseInt(pageStr);
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-[95vw] mx-auto space-y-8">
        <header className="space-y-4">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Detail View
              </Button>
            </Link>
            <div className="flex-1">
              <h1 className="text-4xl font-bold">Wound Analysis Grid View</h1>
              <p className="text-muted-foreground">
                Browse all samples in a grid layout
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-4 flex-wrap">
            <Label className="text-sm font-medium whitespace-nowrap">
              Filter:
            </Label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm"
                  disabled={isLoading}
                  className="h-9"
                >
                  <Filter className="h-4 w-4 mr-2" />
                  {sortLabels[sortBy]}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Sort Files By</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleSortChange('none')}>
                  No Filter
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleSortChange('necrosis')}>
                  Most Necrosis (Black)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleSortChange('slough')}>
                  Most Slough (Yellow)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleSortChange('red_tissue')}>
                  Most Red Tissue
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="flex items-center gap-4">
              <div className="text-sm text-muted-foreground">
                Total: {dataFiles.length} samples
              </div>
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePreviousPage}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Select 
                    value={currentPage.toString()} 
                    onValueChange={handlePageSelect}
                  >
                    <SelectTrigger className="w-[140px] h-9">
                      <SelectValue>
                        Page {currentPage} of {totalPages}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                        <SelectItem key={page} value={page.toString()}>
                          Page {page} ({(page - 1) * ITEMS_PER_PAGE + 1}-{Math.min(page * ITEMS_PER_PAGE, dataFiles.length)})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleNextPage}
                    disabled={currentPage === totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main>
          {error && (
            <div className="p-4 border border-red-500 bg-red-50 dark:bg-red-950 rounded-md">
              <p className="text-red-700 dark:text-red-300">Error: {error}</p>
            </div>
          )}
          
          {isLoading && samples.length === 0 && (
            <div className="flex items-center justify-center p-8">
              <p className="text-muted-foreground">Loading samples...</p>
            </div>
          )}
          
          {!error && samples.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
              {samples.map((sample) => (
                <SampleCard 
                  key={sample.filename} 
                  sample={sample}
                />
               ))}
             </div>
           )}
           
           {!error && samples.length > 0 && totalPages > 1 && (
             <div className="flex items-center justify-center gap-2 mt-8">
               <Button
                 variant="outline"
                 onClick={handlePreviousPage}
                 disabled={currentPage === 1}
               >
                 <ChevronLeft className="h-4 w-4 mr-2" />
                 Previous
               </Button>
               <Select 
                 value={currentPage.toString()} 
                 onValueChange={handlePageSelect}
               >
                 <SelectTrigger className="w-[180px]">
                   <SelectValue>
                     Page {currentPage} of {totalPages}
                   </SelectValue>
                 </SelectTrigger>
                 <SelectContent>
                   {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                     <SelectItem key={page} value={page.toString()}>
                       Page {page} ({(page - 1) * ITEMS_PER_PAGE + 1}-{Math.min(page * ITEMS_PER_PAGE, dataFiles.length)})
                     </SelectItem>
                   ))}
                 </SelectContent>
               </Select>
               <Button
                 variant="outline"
                 onClick={handleNextPage}
                 disabled={currentPage === totalPages}
               >
                 Next
                 <ChevronRight className="h-4 w-4 ml-2" />
               </Button>
             </div>
           )}
         </main>
       </div>
     </div>
   );
}

function SampleCard({ sample }: { sample: SampleThumbnail }) {
  const [originalImgSrc, setOriginalImgSrc] = useState<string>('');
  const [segmentedImgSrc, setSegmentedImgSrc] = useState<string>('');
  const [isHovered, setIsHovered] = useState<boolean>(false);

  // Load original image on mount
  useEffect(() => {
    if (!sample.woundData) return;

    async function loadOriginalImage() {
      try {
        const response = await fetch(`/api/original-image/${sample!.woundData!.image_filename}`);
        if (!response.ok) {
          throw new Error('Failed to fetch original image');
        }
        const imageData = await response.json();
        setOriginalImgSrc(imageData.base64);
      } catch (error) {
        console.error(`Failed to load original image: ${sample!.woundData!.image_filename}`, error);
      }
    }

    loadOriginalImage();
  }, [sample]);

  // Generate segmented image on hover
  useEffect(() => {
    if (!sample.woundData || !isHovered || segmentedImgSrc) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = sample.woundData.image_dimensions;
    canvas.width = width;
    canvas.height = height;

    // Create image data
    const imageData = ctx.createImageData(width, height);

    // Draw segmented image
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const bgr = sample.woundData.img_bgr[y][x];
        const idx = (y * width + x) * 4;
        imageData.data[idx] = bgr[2];     // R
        imageData.data[idx + 1] = bgr[1]; // G
        imageData.data[idx + 2] = bgr[0]; // B
        imageData.data[idx + 3] = 255;    // A
      }
    }

    ctx.putImageData(imageData, 0, 0);

    // Draw overlay
    const clusterMap = new Map<number, typeof sample.woundData.clusters[0]>();
    for (const cluster of sample.woundData.clusters) {
      clusterMap.set(cluster.cluster_id, cluster);
    }

    const currentImageData = ctx.getImageData(0, 0, width, height);
    const overlayOpacity = 0.6;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const label = sample.woundData.labels[y][x];
        if (label < 0) continue;

        const cluster = clusterMap.get(label);
        if (!cluster) continue;

        const necrosisScore = Math.max(0, Math.min(1, cluster.scores.necrosis));
        const redScore = Math.max(0, Math.min(1, cluster.scores.red_tissue));
        const sloughScore = Math.max(0, Math.min(1, cluster.scores.slough));

        const blendedColor = {
          r: redScore * 255 + sloughScore * 255,
          g: sloughScore * 255,
          b: 0,
        };

        const maxScore = Math.max(necrosisScore, redScore, sloughScore);
        const alpha = maxScore * overlayOpacity;

        const idx = (y * width + x) * 4;

        currentImageData.data[idx] = Math.round(
          currentImageData.data[idx] * (1 - alpha) + blendedColor.r * alpha
        );
        currentImageData.data[idx + 1] = Math.round(
          currentImageData.data[idx + 1] * (1 - alpha) + blendedColor.g * alpha
        );
        currentImageData.data[idx + 2] = Math.round(
          currentImageData.data[idx + 2] * (1 - alpha) + blendedColor.b * alpha
        );
      }
    }

    ctx.putImageData(currentImageData, 0, 0);
    setSegmentedImgSrc(canvas.toDataURL());
  }, [sample, isHovered, segmentedImgSrc]);

  const displayName = sample.filename.replace('.json', '');
  const currentImgSrc = isHovered && segmentedImgSrc ? segmentedImgSrc : originalImgSrc;
  
  return (
    <Link href={`/?file=${sample.filename}`}>
      <Card 
        className="hover:shadow-lg transition-shadow cursor-pointer overflow-hidden"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <CardContent className="p-0">
          <div className="relative aspect-square bg-muted">
            {currentImgSrc ? (
              <img 
                src={currentImgSrc} 
                alt={displayName}
                className="w-full h-full object-cover"
                style={{ imageRendering: 'pixelated' }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <p className="text-xs text-muted-foreground">Loading...</p>
              </div>
            )}
            <div className="absolute top-2 right-2 flex gap-1">
              {sample.isReviewed && (
                <Badge variant="secondary" className="text-xs">
                  Reviewed
                </Badge>
              )}
              {sample.isSeen && (
                <Badge variant="outline" className="text-xs border-green-500 text-green-700 dark:text-green-400">
                  Seen
                </Badge>
              )}
            </div>
          </div>
          <div className="p-3">
            <p className="text-sm font-medium truncate" title={displayName}>
              {displayName}
            </p>
            {sample.woundData && (() => {
              const { necrosis, slough, red_tissue } = sample.woundData.tissue_statistics.percentages;
              const maxValue = Math.max(necrosis, slough, red_tissue);
              const isNecrosisMax = necrosis === maxValue;
              const isSloughMax = slough === maxValue;
              const isRedTissueMax = red_tissue === maxValue;
              
              return (
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  <div className="flex justify-between">
                    <span className={isNecrosisMax ? 'text-black dark:text-white font-semibold' : ''}>Necrosis:</span>
                    <span className={isNecrosisMax ? 'text-black dark:text-white font-semibold' : ''}>{necrosis.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className={isSloughMax ? 'text-yellow-600 dark:text-yellow-400 font-semibold' : ''}>Slough:</span>
                    <span className={isSloughMax ? 'text-yellow-600 dark:text-yellow-400 font-semibold' : ''}>{slough.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className={isRedTissueMax ? 'text-red-600 dark:text-red-400 font-semibold' : ''}>Red Tissue:</span>
                    <span className={isRedTissueMax ? 'text-red-600 dark:text-red-400 font-semibold' : ''}>{red_tissue.toFixed(1)}%</span>
                  </div>
                </div>
              );
            })()}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

