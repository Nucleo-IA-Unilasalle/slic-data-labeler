import type {
  DosageContext,
  DosageRuleSuggestion,
  PresentationMode,
} from './types';

export function isDemoMode(): boolean {
  return process.env.NEXT_PUBLIC_DOSAGE_DEMO_MODE === '1';
}

interface DemoCase {
  imageName: string;
  context: DosageContext;
  suggestion: DosageRuleSuggestion;
}

const DEMO_CASES: DemoCase[] = [
  {
    imageName: 'test_other_fusc_0012.png',
    context: {
      tissue: {
        epithelial: 0,
        slough: 0,
        granulation: 1,
        necrotic: 0,
        dominant: 'granulação',
      },
      exudate: { amount: 'medium' },
      flags: {
        adequateGranulation: true,
        extensiveNecrosis: false,
        finalEpithelialization: false,
      },
    },
    suggestion: {
      decisionCategory: 'eligible_moderate',
      doseRange: '3-6',
      wavelength: 'combined_red_infrared',
      rationale: 'Úlcera superficial com granulação adequada e exsudato baixo/moderado sugere vermelho ou combinado.',
      sourceRule: 'demo_mock_rule_granulation',
    },
  },
  {
    imageName: 'test_other_fusc_0021.png',
    context: {
      tissue: {
        epithelial: 0,
        slough: 1,
        granulation: 0,
        necrotic: 0,
        dominant: 'esfacelo',
      },
      exudate: { amount: 'high' },
      flags: {
        extensiveNecrosis: false,
        adequateGranulation: false,
        finalEpithelialization: false,
      },
    },
    suggestion: {
      decisionCategory: 'postpone',
      doseRange: 'none',
      wavelength: 'none',
      rationale: 'Adiar PBM até estabilização. Priorizar estabilização, controle de infecção, desbridamento, manejo de exsudato e cuidado padrão.',
      sourceRule: 'demo_mock_rule_high_exudate',
    },
  },
  {
    imageName: 'test_other_fusc_0035.png',
    context: {
      tissue: {
        epithelial: 1,
        slough: 0,
        granulation: 0,
        necrotic: 0,
        dominant: 'epitelial',
      },
      exudate: { amount: 'low' },
      flags: {
        finalEpithelialization: true,
        extensiveNecrosis: false,
        adequateGranulation: false,
      },
    },
    suggestion: {
      decisionCategory: 'reduce_final_epithelialization',
      doseRange: '1-3',
      wavelength: 'red_630_685',
      rationale: 'Epitelização final sugere dose reduzida nas bordas.',
      sourceRule: 'demo_mock_rule_epithelialization',
    },
  },
  {
    imageName: 'test_other_fusc_0040.png',
    context: {
      tissue: {
        epithelial: 0,
        slough: 0,
        granulation: 0,
        necrotic: 1,
        dominant: 'necrótico',
      },
      exudate: { amount: 'none' },
      flags: {
        extensiveNecrosis: true,
        adequateGranulation: false,
        finalEpithelialization: false,
      },
    },
    suggestion: {
      decisionCategory: 'block_pbm',
      doseRange: 'none',
      wavelength: 'none',
      rationale: 'Bloquear PBM por necrose extensa ou sinal sistêmico/crítico.',
      sourceRule: 'demo_mock_rule_necrosis_block',
    },
  },
  {
    imageName: 'test_other_fusc_0049.png',
    context: {
      tissue: {
        epithelial: 0,
        slough: 0,
        granulation: 0,
        necrotic: 1,
        dominant: 'necrótico',
      },
      exudate: { amount: 'medium' },
      flags: {
        extensiveNecrosis: true,
        adequateGranulation: false,
        finalEpithelialization: false,
      },
    },
    suggestion: {
      decisionCategory: 'postpone',
      doseRange: 'none',
      wavelength: 'none',
      rationale: 'Adiar PBM até estabilização quando houver necrose extensa.',
      sourceRule: 'demo_mock_rule_necrosis_postpone',
    },
  },
];

const DEMO_ASSIGNMENT_STATS = {
  totalCount: 5,
  totalAssignmentCount: 15,
  completedCount: 0,
  skippedCount: 0,
  remainingCount: 15,
};

let demoIndex = 0;

export async function getDemoAssignment(username: string): Promise<{
  done: boolean;
  imageName?: string;
  presentationMode?: PresentationMode;
  assignmentSequence?: number;
  totalCount: number;
  totalAssignmentCount: number;
  completedCount: number;
  skippedCount: number;
  remainingCount: number;
}> {
  void username;

  if (demoIndex >= DEMO_CASES.length) {
    return {
      done: true,
      ...DEMO_ASSIGNMENT_STATS,
      completedCount: DEMO_CASES.length,
      remainingCount: 0,
    };
  }

  const modes: PresentationMode[] = ['blind', 'context', 'suggestion_review'];
  const modeIndex = demoIndex % 3;
  const caseIndex = Math.floor(demoIndex / 3);

  return {
    done: false,
    imageName: DEMO_CASES[caseIndex].imageName,
    presentationMode: modes[modeIndex],
    assignmentSequence: demoIndex + 1,
    ...DEMO_ASSIGNMENT_STATS,
  };
}

export function getDemoContext(imageName: string, mode: PresentationMode): {
  context: DosageContext | null;
  suggestion: DosageRuleSuggestion | null;
} {
  const demoCase = DEMO_CASES.find((c) => c.imageName === imageName) ?? DEMO_CASES[0];

  return {
    context: mode === 'blind' ? null : demoCase.context,
    suggestion: mode === 'suggestion_review' ? demoCase.suggestion : null,
  };
}

export function advanceDemoIndex(): void {
  demoIndex++;
}

export function resetDemoIndex(): void {
  demoIndex = 0;
}
