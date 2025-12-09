'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { ArrowLeft, Shuffle, LogOut, User } from 'lucide-react';
import Link from 'next/link';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface ImageInfo {
  unclassifiedImages: string[];
  totalCount: number;
  unclassifiedCount: number;
  classifiedCount: number;
}

type ExudateLevel = 'none' | 'low' | 'medium' | 'high';
type TissueKey = 'epitelial' | 'esfacelo' | 'granulacao' | 'necrotic';

export default function MinimalisticSupervisionPage() {
  const [username, setUsername] = useState<string | null>(null);
  const [usernameInput, setUsernameInput] = useState<string>('');
  const [imageInfo, setImageInfo] = useState<ImageInfo | null>(null);
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [imageSrc, setImageSrc] = useState<string>('');
  const [selectedExudate, setSelectedExudate] = useState<ExudateLevel | null>(null);
  const [tissueValues, setTissueValues] = useState<Record<TissueKey, number | null>>({
    epitelial: 0,
    esfacelo: 0,
    granulacao: 0,
    necrotic: 0,
  });
  const [observation, setObservation] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isImageModalOpen, setIsImageModalOpen] = useState<boolean>(false);
  const tissueOptions: { key: TissueKey; label: string; description: string }[] = [
    { key: 'granulacao', label: 'Granulação', description: 'Tecido vermelho vivo indicando cicatrização ativa' },
    { key: 'esfacelo', label: 'Esfacelo', description: 'Tecido amarelado ou fibrina que precisa ser removido' },
    { key: 'necrotic', label: 'Necrótico', description: 'Tecido preto/escuro morto que impede cicatrização' },
    { key: 'epitelial', label: 'Epitelial', description: 'Nova pele rosada/clarinha cobrindo a lesão' },
  ];

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const response = await fetch(`/api/supervision/list-images-v2?username=${encodeURIComponent(username || '')}`);
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

    const priorityList = imageList.filter(
      (name) => name.startsWith('train_wsnet') || name.startsWith('train_medetec')
    );
    const pool = priorityList.length > 0 ? priorityList : imageList;

    const randomIndex = Math.floor(Math.random() * pool.length);
    const selectedImage = pool[randomIndex];
    
    setCurrentImage(selectedImage);
    setSelectedExudate(null);
    setTissueValues({
      epitelial: 0,
      esfacelo: 0,
      granulacao: 0,
      necrotic: 0,
    });
    setObservation('');
    
    // Load image
    loadImage(selectedImage);
  };

  const loadRandomImage = (imageList: string[]): void => {
    if (!imageInfo) return;
    loadRandomImageWithInfo(imageList);
  };

  const loadImage = async (filename: string): Promise<void> => {
    setImageSrc(`/dataset_all/${filename}`);
  };

  const handleSaveClassification = async (): Promise<void> => {
    const allTissueSelected = Object.values(tissueValues).every((value) => value !== null);

    if (!currentImage || !selectedExudate || !allTissueSelected || !username) {
      toast.error('Por favor, selecione exsudato e todas as notas de tecido');
      return;
    }
    
    try {
      setIsSaving(true);
      
      const response = await fetch('/api/supervision/save-classification-v2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: username,
          image_name: currentImage,
          qtd_exudado: selectedExudate,
          tissue_epitelial: tissueValues.epitelial,
          tissue_esfacelo: tissueValues.esfacelo,
          tissue_granulacao: tissueValues.granulacao,
          tissue_necrotic: tissueValues.necrotic,
          obs: observation.trim() || null,
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

  const handleSkip = async (): Promise<void> => {
    if (!currentImage || !username) {
      toast.error('Por favor, selecione uma imagem para pular');
      return;
    }

    try {
      setIsSaving(true);
      const response = await fetch('/api/supervision/skip-image-v2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: username,
          image_name: currentImage,
          obs: observation.trim() || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Falha ao pular imagem');
      }

      toast.success('Imagem pulada com sucesso!');
      await fetchImageList();
    } catch (error) {
      console.error('Error skipping image:', error);
      toast.error(error instanceof Error ? error.message : 'Falha ao pular imagem');
    } finally {
      setIsSaving(false);
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
              disabled={!usernameInput.trim()}
              className="w-full"
              size="lg"
            >
              Começar
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
    <div className="min-h-screen p-4 lg:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-0">
          <div>
            <h1 className="text-2xl sm:text-4xl font-bold">Classificação Humana</h1>
            <p className="text-muted-foreground text-sm sm:text-base">
              Classifique imagens de feridas por nível de exsudato e tipo de tecido
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mt-2 sm:mt-0">
            <Link href={`/minimalistic-supervision/user/${encodeURIComponent(username)}`}>
              <Button variant="ghost" size="sm" className="w-full sm:w-auto">
                <User className="h-4 w-4 mr-2" />
                {username}
              </Button>
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="w-full sm:w-auto"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sair
            </Button>
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
                  disabled={!imageInfo || imageInfo.unclassifiedImages.length === 0 || isSaving}
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
                    className="max-w-full max-h-[500px] object-contain border rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => setIsImageModalOpen(true)}
                  />
                ) : (
                  <div className="w-full h-64 bg-muted flex items-center justify-center rounded-lg">
                    <p className="text-muted-foreground">Carregando imagem...</p>
                  </div>
                )}
              </div>

              {/* Exudate Level Selection */}
              <div className="space-y-3">
                <Label className="text-base font-semibold">Quantidade de Exsudato</Label>
                <div className="flex flex-col xs:flex-row gap-2 xs:gap-3">
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
                        className="flex-1 min-w-[92px] sm:min-w-0 text-xs sm:text-sm px-2 py-2"
                      >
                        {labelMap[level]}
                      </Button>
                    );
                  })}
                </div>
              </div>

              {/* Tissue Scores Selection */}
              <div className="space-y-3">
                <Label className="text-base font-semibold">Notas por tecido</Label>
                {tissueOptions.map(({ key, label, description }) => (
                  <div key={key} className="space-y-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="text-sm font-medium cursor-help w-fit">{label}</div>
                      </TooltipTrigger>
                      <TooltipContent>{description}</TooltipContent>
                    </Tooltip>
                    <div className="grid grid-cols-4 gap-2 sm:gap-3">
                      {[
                        { value: 0, text: 'Ausente' },
                        { value: 0.33, text: 'Pouco presente' },
                        { value: 0.5, text: 'Presente' },
                        { value: 1, text: 'Abundante' },
                      ].map(({ value, text }) => (
                        <Button
                          key={text}
                          variant={tissueValues[key] === value ? 'default' : 'outline'}
                          onClick={() =>
                            setTissueValues((prev) => ({
                              ...prev,
                              [key]: value,
                            }))
                          }
                          className="w-full text-xs sm:text-sm py-2"
                        >
                          {text}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Observation Textarea */}
              <div className="space-y-3">
                <Label htmlFor="observation" className="text-base font-semibold">
                  Observações (opcional)
                </Label>
                <Textarea
                  id="observation"
                  value={observation}
                  onChange={(e) => setObservation(e.target.value)}
                  placeholder="Digite observações sobre a imagem..."
                  rows={3}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                />
              </div>

              {/* Save Button */}
              <Button
                onClick={handleSaveClassification}
                disabled={
                  !selectedExudate
                  || Object.values(tissueValues).some((value) => value === null)
                  || isSaving
                }
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

        {/* Image Modal */}
        {isImageModalOpen && imageSrc && (
          <div
            className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50"
            onClick={() => setIsImageModalOpen(false)}
          >
            <img
              src={imageSrc}
              alt={currentImage || 'Imagem expandida'}
              className="h-[90vh] object-contain ring-1 ring-border"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
      </div>
    </div>
  );
}

