'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Lightbulb, LogOut, Shuffle, User } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type {
  DosageAssignment,
  DosageContext,
  DosageDecisionCategory,
  DosageDoseRange,
  DosageRuleSuggestion,
  DosageWavelength,
  PresentationMode,
} from '@/lib/dosage/types';

const decisionOptions: Array<[DosageDecisionCategory, string]> = [
  ['block_pbm', 'Bloquear PBM'],
  ['postpone', 'Adiar PBM'],
  ['eligible_low', 'Elegível - dose baixa'],
  ['eligible_moderate', 'Elegível - dose moderada'],
  ['eligible_cautious', 'Elegível cautelosa'],
  ['specialized_deep', 'Especializada / profunda'],
  ['reduce_final_epithelialization', 'Reduzir na epitelização final'],
  ['research_only', 'Pesquisa / sem rotina clínica'],
  ['re_evaluate_plan', 'Reavaliar plano'],
  ['suspend_reassess', 'Suspender e reavaliar'],
  ['after_debridement_only', 'Somente após desbridamento'],
  ['open_wound_care', 'Tratamento de ferida aberta'],
  ['not_sure', 'Indeterminável'],
];

const doseOptions: Array<[DosageDoseRange, string]> = [
  ['none', 'Nenhuma'],
  ['no_clinical_routine', 'Não definir rotina clínica'],
  ['1-2', '1-2 J/cm²'],
  ['1-3', '1-3 J/cm²'],
  ['2-4', '2-4 J/cm²'],
  ['2-6', '2-6 J/cm²'],
  ['2-and-2', '2 J + 2 J/cm²'],
  ['2-and-3', '2 J + 3 J/cm²'],
  ['3-4', '3-4 J/cm²'],
  ['3-6', '3-6 J/cm²'],
  ['4', '4 J/cm²'],
  ['4-8', '4-8 J/cm²'],
  ['6-9', '6-9 J/cm²'],
  ['6-10', '6-10 J/cm²'],
  ['12-20', '12-20 J/cm²'],
  ['by_area', 'Dose por área'],
  ['custom', 'Personalizada'],
];

const wavelengthOptions: Array<[DosageWavelength, string]> = [
  ['none', 'Nenhum / PBM não indicada agora'],
  ['no_clinical_routine', 'Não definir rotina clínica'],
  ['red_630_685', 'Vermelho 630-685 nm'],
  ['red_660', 'Vermelho 660 nm'],
  ['infrared_808', 'Infravermelho 808 nm'],
  ['infrared_808_830', 'Infravermelho 808-830 nm'],
  ['infrared_808_904', 'Infravermelho 808-904 nm'],
  ['combined_red_infrared', 'Combinado vermelho + IV'],
  ['red_660_infrared', 'Vermelho 660 nm + infravermelho'],
  ['infrared_bed_red_edges', 'IV no leito + vermelho nas bordas'],
  ['blue_405', 'Azul 405 nm'],
  ['not_sure', 'Indeterminado / requer avaliação'],
];

const decisionLabels = Object.fromEntries(decisionOptions) as Record<DosageDecisionCategory, string>;
const doseLabels = Object.fromEntries(doseOptions) as Record<DosageDoseRange, string>;
const wavelengthLabels = Object.fromEntries(wavelengthOptions) as Record<DosageWavelength, string>;

const safetyMessages: Partial<Record<DosageDecisionCategory, string>> = {
  block_pbm: 'Encaminhar ou solicitar avaliação urgente antes de considerar PBM.',
  postpone: 'Priorizar estabilização, controle de infecção, desbridamento, manejo de exsudato e cuidado padrão.',
  research_only: 'Não definir rotina clínica. 660 nm ou 808 nm apenas em protocolo de pesquisa.',
  reduce_final_epithelialization: 'Aplicação preferencial nas bordas. Evitar sobretratamento.',
  specialized_deep: 'Uso em contexto multiprofissional. Leito: 6-10 J/cm²; bordas: 2-4 J/cm².',
  re_evaluate_plan: 'Não aumentar dose automaticamente. Revisar offloading, perfusão, infecção, adesão e técnica.',
  suspend_reassess: 'Suspender PBM até nova classificação clínica. Segurança antes de performance.',
  after_debridement_only: 'Não definir PBM antes do desbridamento quando esse for o pré-requisito clínico.',
  open_wound_care: 'Conduzir como tratamento de ferida aberta; registrar dose/laser apenas se houver indicação do especialista.',
  not_sure: 'Não sugerir dose ou comprimento de onda automáticos. Requer avaliação profissional.',
};

const modeLabels: Record<PresentationMode, string> = {
  blind: 'Cego',
  context: 'Com contexto',
  suggestion_review: 'Revisão de sugestão',
};

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Não disponível';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  return String(value);
}

export default function DosageSupervisionPage() {
  const [username, setUsername] = useState<string | null>(null);
  const [usernameInput, setUsernameInput] = useState('');
  const [assignment, setAssignment] = useState<DosageAssignment | null>(null);
  const [context, setContext] = useState<DosageContext | null>(null);
  const [suggestion, setSuggestion] = useState<DosageRuleSuggestion | null>(null);
  const [decisionCategory, setDecisionCategory] = useState<DosageDecisionCategory | null>(null);
  const [redDose, setRedDose] = useState<number>(0);
  const [infraDose, setInfraDose] = useState<number>(0);
  const [blueDose, setBlueDose] = useState<number>(0);
  const [acceptedSuggestion, setAcceptedSuggestion] = useState<boolean | null>(null);
  const [editedFields, setEditedFields] = useState<string[]>([]);
  const [observation, setObservation] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  const isEligible = decisionCategory !== null && !['block_pbm', 'postpone', 'not_sure'].includes(decisionCategory);

  useEffect(() => {
    const storedUsername = localStorage.getItem('username');
    if (storedUsername) {
      setUsername(storedUsername);
    }
  }, []);

  useEffect(() => {
    if (username) {
      fetchAssignment(username);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  function resetLabels(): void {
    setDecisionCategory(null);
    setRedDose(0);
    setInfraDose(0);
    setBlueDose(0);
    setAcceptedSuggestion(null);
    setEditedFields([]);
    setObservation('');
  }

  function trackEditedField(field: string): void {
    if (acceptedSuggestion === true) {
      setAcceptedSuggestion(false);
      setEditedFields((current) => current.includes(field) ? current : [...current, field]);
    }
  }

  async function fetchContext(imageName: string, mode: PresentationMode): Promise<void> {
    const response = await fetch(
      `/api/dosage-supervision/case-context?imageName=${encodeURIComponent(imageName)}&mode=${mode}`
    );
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Falha ao carregar contexto');
    }

    setContext(data.context);
    setSuggestion(data.suggestion);
  }

  async function fetchAssignment(activeUsername: string): Promise<void> {
    try {
      setIsLoading(true);
      setIsComplete(false);

      const response = await fetch(
        `/api/dosage-supervision/list-cases?username=${encodeURIComponent(activeUsername)}`
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Falha ao carregar caso');
      }

      if (data.done) {
        setAssignment(null);
        setContext(null);
        setSuggestion(null);
        setIsComplete(true);
        return;
      }

      setAssignment({
        imageName: data.imageName,
        presentationMode: data.presentationMode,
        assignmentSequence: data.assignmentSequence,
        totalCount: data.totalCount,
        totalAssignmentCount: data.totalAssignmentCount,
        completedCount: data.completedCount,
        skippedCount: data.skippedCount,
        remainingCount: data.remainingCount,
      });
      await fetchContext(data.imageName, data.presentationMode);
      resetLabels();
    } catch (error) {
      console.error('Error fetching dosage assignment:', error);
      toast.error(error instanceof Error ? error.message : 'Falha ao carregar caso');
    } finally {
      setIsLoading(false);
    }
  }

  function handleDecisionSelect(value: DosageDecisionCategory): void {
    setDecisionCategory(value);
    trackEditedField('decision_category');

    if (['block_pbm', 'postpone', 'not_sure'].includes(value)) {
      setRedDose(0);
      setInfraDose(0);
      setBlueDose(0);
    }
  }

  function acceptSuggestion(): void {
    if (!suggestion) return;

    setDecisionCategory(suggestion.decisionCategory);

    let targetRed = 0;
    let targetInfra = 0;
    let targetBlue = 0;

    let doseVal = 4;
    if (suggestion.doseRange === '1-2') doseVal = 1.5;
    else if (suggestion.doseRange === '1-3') doseVal = 2;
    else if (suggestion.doseRange === '2-4') doseVal = 3;
    else if (suggestion.doseRange === '2-6') doseVal = 4;
    else if (suggestion.doseRange === '3-4') doseVal = 3.5;
    else if (suggestion.doseRange === '3-6') doseVal = 4.5;
    else if (suggestion.doseRange === '4') doseVal = 4;
    else if (suggestion.doseRange === '4-8') doseVal = 6;
    else if (suggestion.doseRange === '6-9') doseVal = 7.5;
    else if (suggestion.doseRange === '6-10') doseVal = 8;
    else if (suggestion.doseRange === '12-20') doseVal = 16;

    const wl = suggestion.wavelength;
    if (wl === 'red_660' || wl === 'red_630_685') {
      targetRed = doseVal;
    } else if (wl === 'infrared_808' || wl === 'infrared_808_830' || wl === 'infrared_808_904') {
      targetInfra = doseVal;
    } else if (wl === 'blue_405') {
      targetBlue = doseVal;
    } else if (wl === 'combined_red_infrared' || wl === 'red_660_infrared') {
      targetRed = 3;
      targetInfra = 6;
    } else if (wl === 'infrared_bed_red_edges') {
      targetRed = 3;
      targetInfra = 8;
    }

    setRedDose(targetRed);
    setInfraDose(targetInfra);
    setBlueDose(targetBlue);

    setAcceptedSuggestion(true);
    setEditedFields([]);
  }

  function handleSetUsername(): void {
    if (!usernameInput.trim()) {
      toast.error('Por favor, digite um nome de usuário');
      return;
    }

    const trimmedUsername = usernameInput.trim();
    localStorage.setItem('username', trimmedUsername);
    setUsername(trimmedUsername);
    setUsernameInput('');
  }

  function handleLogout(): void {
    localStorage.removeItem('username');
    setUsername(null);
    setAssignment(null);
    setContext(null);
    setSuggestion(null);
    setIsComplete(false);
    resetLabels();
    toast.success('Desconectado com sucesso');
  }

  async function handleSaveLabel(): Promise<void> {
    if (!username || !assignment || !decisionCategory) {
      toast.error('Preencha a decisão terapêutica');
      return;
    }

    const isEligible = !['block_pbm', 'postpone', 'not_sure'].includes(decisionCategory);

    if (isEligible && redDose === 0 && infraDose === 0 && blueDose === 0) {
      toast.error('Preencha pelo menos uma dose de laser para PBM elegível');
      return;
    }

    let resolvedWavelength: DosageWavelength = 'none';
    if (isEligible) {
      if (redDose > 0 && infraDose > 0) {
        resolvedWavelength = 'combined_red_infrared';
      } else if (redDose > 0) {
        resolvedWavelength = 'red_660';
      } else if (infraDose > 0) {
        resolvedWavelength = 'infrared_808';
      } else if (blueDose > 0) {
        resolvedWavelength = 'blue_405';
      }
    }

    const hasAnyDose = redDose > 0 || infraDose > 0 || blueDose > 0;
    const resolvedDoseRange: DosageDoseRange = hasAnyDose ? 'custom' : 'none';

    const customDoseParts: string[] = [];
    if (redDose > 0) {
      customDoseParts.push(`Vermelho 660 nm: ${redDose} J/cm²`);
    }
    if (infraDose > 0) {
      customDoseParts.push(`Infravermelho 808 nm: ${infraDose} J/cm²`);
    }
    if (blueDose > 0) {
      customDoseParts.push(`Azul 405 nm: ${blueDose} J/cm²`);
    }
    const resolvedCustomDose = customDoseParts.length > 0 ? customDoseParts.join('; ') : null;

    const appliedLasers = {
      red: redDose,
      infrared: infraDose,
      blue: blueDose,
    };

    try {
      setIsSaving(true);
      const response = await fetch('/api/dosage-supervision/save-label', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          image_name: assignment.imageName,
          presentation_mode: assignment.presentationMode,
          assignment_sequence: assignment.assignmentSequence,
          decision_category: decisionCategory,
          dose_range: resolvedDoseRange,
          custom_dose: resolvedCustomDose,
          wavelength: resolvedWavelength,
          accepted_suggestion: acceptedSuggestion,
          edited_fields: editedFields,
          shown_context: context,
          shown_suggestion: suggestion,
          dosage_obs: observation.trim() || null,
          applied_lasers_json: appliedLasers,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Falha ao salvar dosagem');
      }

      toast.success('Dosagem salva com sucesso!');
      await fetchAssignment(username);
    } catch (error) {
      console.error('Error saving dosage label:', error);
      toast.error(error instanceof Error ? error.message : 'Falha ao salvar dosagem');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSkip(): Promise<void> {
    if (!username || !assignment) {
      toast.error('Nenhum caso carregado para pular');
      return;
    }

    try {
      setIsSaving(true);
      const response = await fetch('/api/dosage-supervision/skip-case', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          image_name: assignment.imageName,
          presentation_mode: assignment.presentationMode,
          assignment_sequence: assignment.assignmentSequence,
          shown_context: context,
          shown_suggestion: suggestion,
          dosage_obs: observation.trim() || null,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Falha ao pular caso');
      }

      toast.success('Caso pulado com sucesso!');
      await fetchAssignment(username);
    } catch (error) {
      console.error('Error skipping dosage case:', error);
      toast.error(error instanceof Error ? error.message : 'Falha ao pular caso');
    } finally {
      setIsSaving(false);
    }
  }

  if (!username) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl">Supervisão de Dosagem</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-muted-foreground">
              Insira seu nome de usuário para começar a rotular decisões de dosagem.
            </p>
            <div className="space-y-3">
              <Label htmlFor="username">Nome de Usuário</Label>
              <input
                id="username"
                type="text"
                value={usernameInput}
                onChange={(event) => setUsernameInput(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && handleSetUsername()}
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

  if (isLoading && !assignment) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 lg:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-2">
            <Link href="/">
              <Button variant="ghost" size="sm" className="-ml-3">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Início
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl sm:text-4xl font-bold">Supervisão de Dosagem</h1>
              <p className="text-muted-foreground text-sm sm:text-base">
                Rotule conduta, faixa de dose e comprimento de onda para cada apresentação.
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <Button variant="ghost" size="sm" className="w-full sm:w-auto">
              <User className="h-4 w-4 mr-2" />
              {username}
            </Button>
            <Button variant="outline" size="sm" onClick={handleLogout} className="w-full sm:w-auto">
              <LogOut className="h-4 w-4 mr-2" />
              Sair
            </Button>
          </div>
        </header>

        {assignment && (
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline">Imagens: {assignment.totalCount}</Badge>
            <Badge variant="secondary">Total de tarefas: {assignment.totalAssignmentCount}</Badge>
            <Badge variant="default">Concluídas: {assignment.completedCount}</Badge>
            <Badge variant="outline">Puladas: {assignment.skippedCount}</Badge>
            <Badge variant="destructive">Restantes: {assignment.remainingCount}</Badge>
          </div>
        )}

        {isComplete && (
          <Card>
            <CardContent className="py-10">
              <div className="text-center space-y-4">
                <CheckCircle2 className="h-12 w-12 mx-auto text-green-600" />
                <h2 className="text-2xl font-semibold">Todas as tarefas de dosagem foram processadas.</h2>
                <p className="text-muted-foreground">
                  Este usuário não possui mais pares imagem/modo pendentes.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {assignment && (
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex flex-col gap-2">
                  <span className="break-all">{assignment.imageName}</span>
                  <div className="flex items-center gap-2">
                    <Badge>{modeLabels[assignment.presentationMode]}</Badge>
                    <Badge variant="outline">Sequência {assignment.assignmentSequence}</Badge>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={handleSkip} disabled={isSaving}>
                  <Shuffle className="h-4 w-4 mr-2" />
                  Pular
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex justify-center">
                <Image
                  src={`/dataset_all/${assignment.imageName}`}
                  alt={assignment.imageName}
                  width={900}
                  height={600}
                  unoptimized
                  className="max-w-full max-h-[500px] object-contain border rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => setIsImageModalOpen(true)}
                />
              </div>

              {context && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Contexto do caso</CardTitle>
                  </CardHeader>
                  <CardContent className="grid md:grid-cols-3 gap-4 text-sm">
                    <div className="space-y-2">
                      <h3 className="font-semibold">Tecido</h3>
                      <p>Dominante: {formatValue(context.tissue?.dominant)}</p>
                      <p>Epitelial: {formatValue(context.tissue?.epithelial)}</p>
                      <p>Granulação: {formatValue(context.tissue?.granulation)}</p>
                      <p>Esfacelo: {formatValue(context.tissue?.slough)}</p>
                      <p>Necrótico: {formatValue(context.tissue?.necrotic)}</p>
                    </div>
                    <div className="space-y-2">
                      <h3 className="font-semibold">Exsudato</h3>
                      <p>Quantidade: {formatValue(context.exudate?.amount)}</p>
                      <p>Tipo: {formatValue(context.exudate?.type)}</p>
                    </div>
                    <div className="space-y-2">
                      <h3 className="font-semibold">Flags derivadas</h3>
                      <p>Necrose extensa: {formatValue(context.flags?.extensiveNecrosis)}</p>
                      <p>Granulação adequada: {formatValue(context.flags?.adequateGranulation)}</p>
                      <p>Epitelização final: {formatValue(context.flags?.finalEpithelialization)}</p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {suggestion && (
                <Card className="border-amber-300 bg-amber-50/40 dark:bg-amber-950/10">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Lightbulb className="h-5 w-5" />
                      Sugestão baseada nas regras
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm">
                    <div className="grid md:grid-cols-3 gap-3">
                      <Badge variant="secondary">{decisionLabels[suggestion.decisionCategory]}</Badge>
                      <Badge variant="secondary">{doseLabels[suggestion.doseRange]}</Badge>
                      <Badge variant="secondary">{wavelengthLabels[suggestion.wavelength]}</Badge>
                    </div>
                    <p>{suggestion.rationale}</p>
                    <p className="text-muted-foreground">Regra: {suggestion.sourceRule}</p>
                    <Button onClick={acceptSuggestion} variant="outline">
                      Aceitar sugestão
                    </Button>
                  </CardContent>
                </Card>
              )}

              <div className="space-y-3">
                <Label className="text-base font-semibold">Decisão terapêutica PBM</Label>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
                  {decisionOptions.map(([value, label]) => (
                    <Button
                      key={value}
                      variant={decisionCategory === value ? 'default' : 'outline'}
                      onClick={() => handleDecisionSelect(value)}
                      className="justify-start h-auto min-h-10 whitespace-normal"
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <Label className="text-base font-semibold">Dosagem por Laser (J/cm²)</Label>
                <div className={`space-y-6 ${!isEligible ? 'opacity-40 pointer-events-none' : ''}`}>
                  {/* Vermelho */}
                  <div className="space-y-2 border border-border rounded-lg p-4 bg-muted/10">
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-sm flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />
                        Laser Vermelho (660 nm)
                      </span>
                      <span className="text-sm font-semibold text-red-500">
                        {redDose === 0 ? 'Desativado' : `${redDose} J/cm²`}
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <input
                        type="range"
                        min="0"
                        max="20"
                        step="0.5"
                        value={redDose}
                        disabled={!isEligible}
                        onChange={(e) => {
                          setRedDose(parseFloat(e.target.value) || 0);
                          trackEditedField('custom_dose');
                        }}
                        className="flex-1 h-2 bg-secondary rounded-lg appearance-none cursor-pointer disabled:opacity-50"
                        style={{
                          background: `linear-gradient(to right, #ef4444 0%, #ef4444 ${(redDose / 20) * 100}%, var(--border) ${(redDose / 20) * 100}%, var(--border) 100%)`,
                          accentColor: '#ef4444'
                        }}
                      />
                      <div className="flex items-center gap-2 w-28 shrink-0">
                        <input
                          type="number"
                          min="0"
                          max="25"
                          step="0.5"
                          value={redDose > 0 ? redDose : ''}
                          placeholder="--"
                          disabled={!isEligible}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setRedDose(isNaN(val) ? 0 : val);
                            trackEditedField('custom_dose');
                          }}
                          className="w-16 px-2 py-1 text-center text-sm font-semibold border rounded bg-background"
                        />
                        <span className="text-xs text-muted-foreground">J/cm²</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap text-xs">
                      <span className="text-muted-foreground mr-1">Atalhos:</span>
                      {[2, 3, 4, 6].map((v) => (
                        <Button
                          key={v}
                          variant="outline"
                          size="sm"
                          type="button"
                          disabled={!isEligible}
                          onClick={() => {
                            setRedDose(v);
                            trackEditedField('custom_dose');
                          }}
                          className="h-7 px-2"
                        >
                          {v} J
                        </Button>
                      ))}
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        disabled={!isEligible}
                        onClick={() => {
                          setRedDose(0);
                          trackEditedField('custom_dose');
                        }}
                        className="h-7 px-2 text-red-500 hover:text-red-600 hover:bg-red-50"
                      >
                        Zerar
                      </Button>
                    </div>
                  </div>

                  {/* Infravermelho */}
                  <div className="space-y-2 border border-border rounded-lg p-4 bg-muted/10">
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-sm flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-amber-700 inline-block" />
                        Laser Infravermelho (808 nm)
                      </span>
                      <span className="text-sm font-semibold text-amber-700">
                        {infraDose === 0 ? 'Desativado' : `${infraDose} J/cm²`}
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <input
                        type="range"
                        min="0"
                        max="20"
                        step="0.5"
                        value={infraDose}
                        disabled={!isEligible}
                        onChange={(e) => {
                          setInfraDose(parseFloat(e.target.value) || 0);
                          trackEditedField('custom_dose');
                        }}
                        className="flex-1 h-2 bg-secondary rounded-lg appearance-none cursor-pointer disabled:opacity-50"
                        style={{
                          background: `linear-gradient(to right, #b45309 0%, #b45309 ${(infraDose / 20) * 100}%, var(--border) ${(infraDose / 20) * 100}%, var(--border) 100%)`,
                          accentColor: '#b45309'
                        }}
                      />
                      <div className="flex items-center gap-2 w-28 shrink-0">
                        <input
                          type="number"
                          min="0"
                          max="25"
                          step="0.5"
                          value={infraDose > 0 ? infraDose : ''}
                          placeholder="--"
                          disabled={!isEligible}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setInfraDose(isNaN(val) ? 0 : val);
                            trackEditedField('custom_dose');
                          }}
                          className="w-16 px-2 py-1 text-center text-sm font-semibold border rounded bg-background"
                        />
                        <span className="text-xs text-muted-foreground">J/cm²</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap text-xs">
                      <span className="text-muted-foreground mr-1">Atalhos:</span>
                      {[4, 6, 8, 10].map((v) => (
                        <Button
                          key={v}
                          variant="outline"
                          size="sm"
                          type="button"
                          disabled={!isEligible}
                          onClick={() => {
                            setInfraDose(v);
                            trackEditedField('custom_dose');
                          }}
                          className="h-7 px-2"
                        >
                          {v} J
                        </Button>
                      ))}
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        disabled={!isEligible}
                        onClick={() => {
                          setInfraDose(0);
                          trackEditedField('custom_dose');
                        }}
                        className="h-7 px-2 text-red-500 hover:text-red-600 hover:bg-red-50"
                      >
                        Zerar
                      </Button>
                    </div>
                  </div>

                  {/* Azul */}
                  <div className="space-y-2 border border-border rounded-lg p-4 bg-muted/10">
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-sm flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" />
                        Laser Azul (405 nm)
                      </span>
                      <span className="text-sm font-semibold text-blue-500">
                        {blueDose === 0 ? 'Desativado' : `${blueDose} J/cm²`}
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <input
                        type="range"
                        min="0"
                        max="20"
                        step="0.5"
                        value={blueDose}
                        disabled={!isEligible}
                        onChange={(e) => {
                          setBlueDose(parseFloat(e.target.value) || 0);
                          trackEditedField('custom_dose');
                        }}
                        className="flex-1 h-2 bg-secondary rounded-lg appearance-none cursor-pointer disabled:opacity-50"
                        style={{
                          background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${(blueDose / 20) * 100}%, var(--border) ${(blueDose / 20) * 100}%, var(--border) 100%)`,
                          accentColor: '#3b82f6'
                        }}
                      />
                      <div className="flex items-center gap-2 w-28 shrink-0">
                        <input
                          type="number"
                          min="0"
                          max="25"
                          step="0.5"
                          value={blueDose > 0 ? blueDose : ''}
                          placeholder="--"
                          disabled={!isEligible}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setBlueDose(isNaN(val) ? 0 : val);
                            trackEditedField('custom_dose');
                          }}
                          className="w-16 px-2 py-1 text-center text-sm font-semibold border rounded bg-background"
                        />
                        <span className="text-xs text-muted-foreground">J/cm²</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap text-xs">
                      <span className="text-muted-foreground mr-1">Atalhos:</span>
                      {[1, 2, 3].map((v) => (
                        <Button
                          key={v}
                          variant="outline"
                          size="sm"
                          type="button"
                          disabled={!isEligible}
                          onClick={() => {
                            setBlueDose(v);
                            trackEditedField('custom_dose');
                          }}
                          className="h-7 px-2"
                        >
                          {v} J
                        </Button>
                      ))}
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        disabled={!isEligible}
                        onClick={() => {
                          setBlueDose(0);
                          trackEditedField('custom_dose');
                        }}
                        className="h-7 px-2 text-red-500 hover:text-red-600 hover:bg-red-50"
                      >
                        Zerar
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {decisionCategory && safetyMessages[decisionCategory] && (
                <Card className="border-sky-200 bg-sky-50/60 dark:bg-sky-950/10">
                  <CardContent className="py-4 text-sm">
                    {safetyMessages[decisionCategory]}
                  </CardContent>
                </Card>
              )}

              <div className="space-y-3">
                <Label htmlFor="observation" className="text-base font-semibold">
                  Observações (opcional)
                </Label>
                <Textarea
                  id="observation"
                  value={observation}
                  onChange={(event) => setObservation(event.target.value)}
                  placeholder="Registre dúvidas, justificativas ou ajustes de dose..."
                  rows={3}
                  className="resize-none"
                />
              </div>

              <Button
                onClick={handleSaveLabel}
                disabled={!decisionCategory || (isEligible && redDose === 0 && infraDose === 0 && blueDose === 0) || isSaving}
                className="w-full"
                size="lg"
              >
                {isSaving ? 'Salvando...' : 'Salvar Dosagem'}
              </Button>
            </CardContent>
          </Card>
        )}

        {isImageModalOpen && assignment && (
          <div
            className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50"
            onClick={() => setIsImageModalOpen(false)}
          >
            <Image
              src={`/dataset_all/${assignment.imageName}`}
              alt={assignment.imageName}
              width={1200}
              height={900}
              unoptimized
              className="h-[90vh] w-auto object-contain ring-1 ring-border"
              onClick={(event) => event.stopPropagation()}
            />
          </div>
        )}
      </div>
    </div>
  );
}
