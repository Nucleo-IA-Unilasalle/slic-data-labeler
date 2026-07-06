import type { DosageContext, DosageRuleSuggestion } from './types';

function isHighExudate(amount: string | undefined): boolean {
  return amount === 'high' || amount?.toLowerCase() === 'intenso';
}

export function getDosageSuggestionFromPdfRules(context: DosageContext): DosageRuleSuggestion {
  const flags = context.flags ?? {};
  const exudateAmount = context.exudate?.amount;
  const necrotic = context.tissue?.necrotic ?? 0;

  if (
    flags.infectionSigns === true
    || flags.criticalIschemia === true
    || flags.gangrene === true
    || flags.suspectedOsteomyelitis === true
  ) {
    return {
      decisionCategory: 'block_pbm',
      doseRange: 'none',
      wavelength: 'none',
      rationale: 'Bloquear PBM por sinal sistêmico/crítico ou suspeita grave descrita no semáforo decisório.',
      sourceRule: 'pdf_table_4_rule_1',
    };
  }

  if (
    flags.extensiveNecrosis === true
    || necrotic > 0.25
    || isHighExudate(exudateAmount)
  ) {
    return {
      decisionCategory: 'postpone',
      doseRange: 'none',
      wavelength: 'none',
      rationale: 'Adiar PBM até estabilização. Priorizar estabilização, controle de infecção, desbridamento, manejo de exsudato e cuidado padrão.',
      sourceRule: 'pdf_table_3_high_exudate_or_necrosis',
    };
  }

  if (flags.intactAtRiskSkin === true) {
    return {
      decisionCategory: 'research_only',
      doseRange: 'no_clinical_routine',
      wavelength: 'no_clinical_routine',
      rationale: 'Pele íntegra em risco não tem rotina clínica robusta; 660 nm ou 808 nm apenas em protocolo de pesquisa.',
      sourceRule: 'pdf_table_3_intact_at_risk_skin',
    };
  }

  if (flags.finalEpithelialization === true) {
    return {
      decisionCategory: 'reduce_final_epithelialization',
      doseRange: '1-3',
      wavelength: 'red_630_685',
      rationale: 'Epitelização final sugere dose reduzida nas bordas.',
      sourceRule: 'pdf_table_3_final_epithelialization',
    };
  }

  if (flags.deepWound === true) {
    return {
      decisionCategory: 'specialized_deep',
      doseRange: 'by_area',
      wavelength: 'infrared_bed_red_edges',
      rationale: 'Úlcera profunda com granulação usa IV 808-904 nm no leito (6-10 J/cm²) e vermelho 630-685 nm nas bordas (2-4 J/cm²) em contexto multiprofissional.',
      sourceRule: 'pdf_table_4_rule_5',
    };
  }

  if (flags.perfusionConcern === true) {
    return {
      decisionCategory: 'eligible_moderate',
      doseRange: '4-8',
      wavelength: 'infrared_808_904',
      rationale: 'Úlcera neuroisquêmica sem isquemia crítica sugere infravermelho em dose moderada.',
      sourceRule: 'pdf_table_3_neuroischemic_without_critical_ischemia',
    };
  }

  if (flags.chronicStagnant === true) {
    return {
      decisionCategory: 'eligible_moderate',
      doseRange: '6-10',
      wavelength: 'combined_red_infrared',
      rationale: 'Ferida crônica estagnada sem bloqueadores sugere IV ou combinado, com reavaliação.',
      sourceRule: 'pdf_table_4_rule_4',
    };
  }

  if (flags.adequateGranulation === true && (exudateAmount === 'low' || exudateAmount === 'medium')) {
    return {
      decisionCategory: 'eligible_moderate',
      doseRange: '3-6',
      wavelength: 'combined_red_infrared',
      rationale: 'Úlcera superficial com granulação adequada e exsudato baixo/moderado sugere vermelho ou combinado.',
      sourceRule: 'pdf_table_3_superficial_granulation',
    };
  }

  if (flags.superficialClean === true) {
    return {
      decisionCategory: 'eligible_low',
      doseRange: '2-6',
      wavelength: 'red_630_685',
      rationale: 'Úlcera neuropática superficial limpa com boa perfusão sugere vermelho em dose baixa-moderada.',
      sourceRule: 'pdf_table_4_rule_3',
    };
  }

  return {
    decisionCategory: 'not_sure',
    doseRange: 'no_clinical_routine',
    wavelength: 'not_sure',
    rationale: 'Dados disponíveis não encaixam de forma segura em uma regra específica da tabela; requer avaliação profissional antes de definir PBM.',
    sourceRule: 'pdf_fallback_insufficient_context',
  };
}
