'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { ArrowLeft, Shuffle, LogOut } from 'lucide-react';
import Link from 'next/link';

interface ImageInfo {
  unclassifiedImages: string[];
  totalCount: number;
  unclassifiedCount: number;
  classifiedCount: number;
}

type ExudateLevel = 'none' | 'low' | 'medium' | 'high';
type TissueType = 'granulação' | 'esfacelo' | 'necrotic' | 'epitelial';

export default function MinimalisticSupervisionPage() {
  const [username, setUsername] = useState<string | null>(null);
  const [usernameInput, setUsernameInput] = useState<string>('');
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(false);
  const [imageInfo, setImageInfo] = useState<ImageInfo | null>(null);
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [imageSrc, setImageSrc] = useState<string>('');
  const [selectedExudate, setSelectedExudate] = useState<ExudateLevel | null>(null);
  const [selectedTissue, setSelectedTissue] = useState<TissueType | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Check username on mount
  useEffect(() => {
    const storedUsername = localStorage.getItem('username');
    if (storedUsername) {
      setUsername(storedUsername);
    }
  }, []);

  // Fetch image list when username changes
  useEffect(() => {
    if (username) {
      fetchImageList();
    }
  }, [username]);

  const handleSetUsername = (): void => {
    if (!usernameInput.trim()) {
      toast.error('Por favor, digite um nome de usuário');
      return;
    }
    
    const trimmedUsername = usernameInput.trim();
    localStorage.setItem('username', trimmedUsername);
    setUsername(trimmedUsername);
    setUsernameInput('');
    fetchImageList();
  };

  const handleLogout = (): void => {
    localStorage.removeItem('username');
    setUsername(null);
    setImageInfo(null);
    setCurrentImage(null);
    toast.success('Desconectado com sucesso');
  };

  // Fetch image list
  const fetchImageList = async (): Promise<void> => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/supervision/list-images?username=${encodeURIComponent(username || '')}`);
      if (!response.ok) {
        const errorData = await response.json();
        console.error('Error fetching image list:', errorData);
        throw new Error(errorData.error || 'Failed to fetch image list');
      }
      const data: ImageInfo = await response.json();
      setImageInfo(data);
      
      // Load first unclassified image if available
      if (data.unclassifiedImages.length > 0) {
        loadRandomImageWithInfo(data.unclassifiedImages);
      }
    } catch (error) {
      console.error('Error fetching image list:', error);
      toast.error('Falha ao carregar lista de imagens');
    } finally {
      setIsLoading(false);
    }
  };

  const loadRandomImageWithInfo = (imageList: string[]): void => {
    if (imageList.length === 0) {
      toast.info('Nenhuma imagem não classificada restante!');
      return;
    }
    
    // Select random image from the list
    const randomIndex = Math.floor(Math.random() * imageList.length);
    const selectedImage = imageList[randomIndex];
    
    setCurrentImage(selectedImage);
    setSelectedExudate(null);
    setSelectedTissue(null);
    
    // Load image
    loadImage(selectedImage);
  };

  const loadRandomImage = (imageList: string[]): void => {
    if (!imageInfo) return;
    loadRandomImageWithInfo(imageList);
  };

  const loadImage = async (filename: string): Promise<void> => {
    try {
      const response = await fetch(`/api/original-image/${filename}`);
      if (!response.ok) {
        throw new Error('Failed to fetch image');
      }
      const data = await response.json();
      setImageSrc(data.base64);
    } catch (error) {
      console.error('Error loading image:', error);
      toast.error('Falha ao carregar imagem');
    }
  };

  const handleSaveClassification = async (): Promise<void> => {
    if (!currentImage || !selectedExudate || !selectedTissue || !username) {
      toast.error('Por favor, selecione nível de exudato e tipo de tecido');
      return;
    }
    
    try {
      setIsSaving(true);
      
      const response = await fetch('/api/supervision/save-classification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: username,
          image_name: currentImage,
          qtd_exudado: selectedExudate,
          tissue_type: selectedTissue,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Falha ao salvar classificação');
      }
      
      toast.success('Classificação salva com sucesso!');
      
      // Refresh image list and load next image
      await fetchImageList();
      
    } catch (error) {
      console.error('Error saving classification:', error);
      toast.error(error instanceof Error ? error.message : 'Falha ao salvar classificação');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSkip = (): void => {
    if (imageInfo) {
      loadRandomImage(imageInfo.unclassifiedImages);
    }
  };

  // Show login screen if no username
  if (!username) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl">Classificação Humana</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-muted-foreground">
              Por favor, insira seu nome de usuário para começar a classificar imagens
            </p>
            <div className="space-y-3">
              <Label htmlFor="username">Nome de Usuário</Label>
              <input
                id="username"
                type="text"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSetUsername()}
                placeholder="Digite seu nome"
                className="w-full px-3 py-2 border border-input rounded-md bg-background"
              />
            </div>
            <Button
              onClick={handleSetUsername}
              disabled={isAuthLoading || !usernameInput.trim()}
              className="w-full"
              size="lg"
            >
              {isAuthLoading ? 'Carregando...' : 'Começar'}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold">Classificação Humana</h1>
            <p className="text-muted-foreground">
              Classifique imagens de feridas por nível de exudato e tipo de tecido
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">
              {username}
            </Badge>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              Sair
            </Button>
            <Link href="/">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Voltar
              </Button>
            </Link>
          </div>
        </header>

        {imageInfo && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline">
                Total: {imageInfo.totalCount}
              </Badge>
              <Badge variant="secondary">
                Classificadas: {imageInfo.classifiedCount}
              </Badge>
              <Badge variant="default">
                Restantes: {imageInfo.unclassifiedCount}
              </Badge>
            </div>
            {imageInfo.unclassifiedCount === 0 && (
              <p className="text-sm text-green-600 dark:text-green-400 font-medium">
                ✓ Todas as imagens foram classificadas!
              </p>
            )}
          </div>
        )}

        {currentImage && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span>{currentImage}</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSkip}
                  disabled={!imageInfo || imageInfo.unclassifiedImages.length === 0}
                >
                  <Shuffle className="h-4 w-4 mr-2" />
                  Pular
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Image Display */}
              <div className="flex justify-center">
                {imageSrc ? (
                  <img
                    src={imageSrc}
                    alt={currentImage}
                    className="max-w-full max-h-[500px] object-contain border rounded-lg"
                  />
                ) : (
                  <div className="w-full h-64 bg-muted flex items-center justify-center rounded-lg">
                    <p className="text-muted-foreground">Carregando imagem...</p>
                  </div>
                )}
              </div>

              {/* Exudate Level Selection */}
              <div className="space-y-3">
                <Label className="text-base font-semibold">Quantidade de Exudado</Label>
                <div className="flex gap-3">
                  {(['none', 'low', 'medium', 'high'] as ExudateLevel[]).map((level) => {
                    const labelMap: Record<ExudateLevel, string> = {
                      none: 'Nenhum',
                      low: 'Baixo',
                      medium: 'Médio',
                      high: 'Alto'
                    };
                    return (
                      <Button
                        key={level}
                        variant={selectedExudate === level ? 'default' : 'outline'}
                        onClick={() => setSelectedExudate(level)}
                        className="flex-1"
                      >
                        {labelMap[level]}
                      </Button>
                    );
                  })}
                </div>
              </div>

              {/* Tissue Type Selection */}
              <div className="space-y-3">
                <Label className="text-base font-semibold">Tipo de Tecido</Label>
                <div className="grid grid-cols-2 gap-3">
                  {(['granulação', 'esfacelo', 'necrotic', 'epitelial'] as TissueType[]).map((type) => {
                    const labelMap: Record<TissueType, string> = {
                      'granulação': 'Granulação',
                      'esfacelo': 'Esfacelo',
                      'necrotic': 'Necrótico',
                      'epitelial': 'Epitelial'
                    };
                    return (
                      <Button
                        key={type}
                        variant={selectedTissue === type ? 'default' : 'outline'}
                        onClick={() => setSelectedTissue(type)}
                        className="w-full"
                      >
                        {labelMap[type]}
                      </Button>
                    );
                  })}
                </div>
              </div>

              {/* Save Button */}
              <Button
                onClick={handleSaveClassification}
                disabled={!selectedExudate || !selectedTissue || isSaving}
                className="w-full"
                size="lg"
              >
                {isSaving ? 'Salvando...' : 'Salvar Classificação'}
              </Button>
            </CardContent>
          </Card>
        )}

        {imageInfo && imageInfo.unclassifiedImages.length === 0 && (
          <Card>
            <CardContent className="py-8">
              <div className="text-center space-y-4">
                <h2 className="text-2xl font-semibold">Todas as imagens foram classificadas!</h2>
                <p className="text-muted-foreground">
                  Você classificou todas as {imageInfo.totalCount} imagens.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

