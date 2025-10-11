'use client';

import { WoundVisualizer } from '@/components/wound-visualizer';
import { WoundVisualizerCNN } from '@/components/wound-visualizer-cnn';
import type { WoundData } from '@/lib/types/wound-data';
import { useEffect, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Shuffle, Eye, EyeOff, Filter, Grid3x3 } from 'lucide-react';
import { toast } from 'sonner';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

export default function Home() {
  const searchParams = useSearchParams();
  const [dataFiles, setDataFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [woundData, setWoundData] = useState<WoundData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [hasReview, setHasReview] = useState<boolean>(false);
  const [visualizationMode, setVisualizationMode] = useState<'slic' | 'cnn'>('slic');
  const [seenFiles, setSeenFiles] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<'none' | 'necrosis' | 'slough' | 'red_tissue'>('none');
  const [isLoadingSort, setIsLoadingSort] = useState<boolean>(false);

  // Load seen files from localStorage on mount
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
        setIsLoadingSort(true);
        const url = sortBy === 'none' 
          ? '/api/data-files'
          : `/api/data-files-sorted?sortBy=${sortBy}`;
        
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error('Failed to fetch data files');
        }
        const data = await response.json();
        setDataFiles(data.files);
        
        // Check if file is specified in URL
        const fileParam = searchParams.get('file');
        if (fileParam && data.files.includes(fileParam)) {
          setSelectedFile(fileParam);
        } else if (!selectedFile && data.files.length > 0) {
          setSelectedFile(data.files[0]);
        }
        
        // Log cache status
        if (data.cached) {
          console.log('Loaded sorted files from cache');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data files');
      } finally {
        setIsLoadingSort(false);
      }
    }
    
    fetchDataFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortBy]);

  useEffect(() => {
    if (!selectedFile) return;

    async function loadDataFile() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/data-files/${selectedFile}`);
        if (!response.ok) {
          throw new Error('Failed to load data file');
        }
        const data = await response.json();
        setWoundData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data file');
      } finally {
        setIsLoading(false);
      }
    }

    loadDataFile();
  }, [selectedFile]);

  useEffect(() => {
    if (!selectedFile) return;

    async function checkReview() {
      try {
        const response = await fetch(`/api/check-review/${selectedFile}`);
        if (!response.ok) {
          throw new Error('Failed to check review');
        }
        const data = await response.json();
        setHasReview(data.hasReview);
      } catch (err) {
        console.error('Error checking review:', err);
        setHasReview(false);
      }
    }

    checkReview();
  }, [selectedFile]);

  const navigateToPrevious = (): void => {
    const currentIndex = dataFiles.indexOf(selectedFile);
    if (currentIndex > 0) {
      setSelectedFile(dataFiles[currentIndex - 1]);
    }
  };

  const navigateToNext = (): void => {
    const currentIndex = dataFiles.indexOf(selectedFile);
    if (currentIndex < dataFiles.length - 1) {
      setSelectedFile(dataFiles[currentIndex + 1]);
    }
  };

  const navigateToRandom = (): void => {
    // Get unseen files
    const unseenFiles = dataFiles.filter((file) => !seenFiles.has(file));
    
    if (unseenFiles.length === 0) {
      toast.info('All files have been marked as seen!');
      // Still allow random selection from all files
      const randomIndex = Math.floor(Math.random() * dataFiles.length);
      setSelectedFile(dataFiles[randomIndex]);
      return;
    }
    
    // Select random from unseen files
    const randomIndex = Math.floor(Math.random() * unseenFiles.length);
    setSelectedFile(unseenFiles[randomIndex]);
  };

  const toggleSeen = (): void => {
    const newSeenFiles = new Set(seenFiles);
    
    if (seenFiles.has(selectedFile)) {
      newSeenFiles.delete(selectedFile);
      toast.success('Marked as unseen');
    } else {
      newSeenFiles.add(selectedFile);
      toast.success('Marked as seen');
    }
    
    setSeenFiles(newSeenFiles);
    
    // Save to localStorage
    localStorage.setItem('seenFiles', JSON.stringify(Array.from(newSeenFiles)));
  };

  const clearAllSeen = (): void => {
    setSeenFiles(new Set());
    localStorage.removeItem('seenFiles');
    toast.success('Cleared all seen markers');
  };

  const handleSortChange = (newSort: 'none' | 'necrosis' | 'slough' | 'red_tissue'): void => {
    setSortBy(newSort);
    const sortLabels = {
      none: 'Default order',
      necrosis: 'Most necrosis',
      slough: 'Most slough',
      red_tissue: 'Most red tissue'
    };
    toast.success(`Sorted by: ${sortLabels[newSort]}`);
  };

  const currentFileIndex = dataFiles.indexOf(selectedFile);
  const isCurrentFileSeen = seenFiles.has(selectedFile);
  const unseenCount = dataFiles.filter((file) => !seenFiles.has(file)).length;

  const sortLabels = {
    none: 'No Filter',
    necrosis: 'Most Necrosis',
    slough: 'Most Slough',
    red_tissue: 'Most Red Tissue'
  };

  return (
    <div className="min-h-screen p-8">
      <div className="sm:max-w-[80vw] mx-auto space-y-8">
        <header className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold">Wound Analysis Visualizer</h1>
              <p className="text-muted-foreground">
                Visualization of wound tissue analysis with superpixel segmentation and cluster predictions
              </p>
            </div>
            <Link href="/grid">
              <Button variant="outline">
                <Grid3x3 className="h-4 w-4 mr-2" />
                Grid View
              </Button>
            </Link>
          </div>
          
          <div className="flex items-center gap-4 flex-wrap mb-4">
            <Label className="text-sm font-medium">Prediction Method:</Label>
            <div className="flex items-center gap-2">
              <Button
                variant={visualizationMode === 'slic' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setVisualizationMode('slic')}
              >
                SLIC Algorithm
              </Button>
              <Button
                variant={visualizationMode === 'cnn' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setVisualizationMode('cnn')}
                className={visualizationMode === 'cnn' ? 'bg-purple-600 hover:bg-purple-700' : ''}
              >
                CNN Model
              </Button>
            </div>
          </div>
          
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Label htmlFor="file-select" className="text-sm font-medium whitespace-nowrap">
                Select Data File:
              </Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm"
                    disabled={isLoadingSort}
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
            </div>
            <div className="flex items-center gap-2">
              <Select value={selectedFile} onValueChange={setSelectedFile} disabled={isLoadingSort}>
                <SelectTrigger id="file-select" className="w-[300px]">
                  <SelectValue placeholder={isLoadingSort ? "Loading..." : "Select a data file"} />
                </SelectTrigger>
                <SelectContent>
                  {dataFiles.map((file) => (
                    <SelectItem key={file} value={file}>
                      {file.replace('.json', '')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {hasReview && (
                <Badge variant="secondary">Reviewed</Badge>
              )}
              {isCurrentFileSeen && (
                <Badge variant="outline" className="border-green-500 text-green-700 dark:text-green-400">
                  Seen
                </Badge>
              )}
            </div>
            <Button
              variant={isCurrentFileSeen ? "default" : "outline"}
              size="sm"
              onClick={toggleSeen}
              className={isCurrentFileSeen ? "bg-green-600 hover:bg-green-700" : ""}
            >
              {isCurrentFileSeen ? <Eye className="h-4 w-4 mr-1" /> : <EyeOff className="h-4 w-4 mr-1" />}
              {isCurrentFileSeen ? 'Seen' : 'Mark as Seen'}
            </Button>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={navigateToPrevious}
                  disabled={currentFileIndex === 0}
                  title="Previous file"
                >
                  <ChevronLeft />
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={navigateToNext}
                  disabled={currentFileIndex === dataFiles.length - 1}
                  title="Next file"
                >
                  <ChevronRight />
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={navigateToRandom}
                  disabled={dataFiles.length === 0}
                  title={unseenCount > 0 ? `Random unseen file (${unseenCount} remaining)` : 'Random file (all seen)'}
                >
                  <Shuffle />
                </Button>
              </div>
              {seenFiles.size > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearAllSeen}
                  title="Clear all seen markers"
                  className="text-xs"
                >
                  Clear Seen ({seenFiles.size})
                </Button>
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
          
          {isLoading && (
            <div className="flex items-center justify-center p-8">
              <p className="text-muted-foreground">Loading data...</p>
            </div>
          )}
          
          {!isLoading && !error && woundData && (
            <>
              {visualizationMode === 'slic' ? (
                <WoundVisualizer data={woundData} />
              ) : (
                <WoundVisualizerCNN data={woundData} />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
