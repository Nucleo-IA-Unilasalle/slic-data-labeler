export type PresentationMode = 'blind' | 'context' | 'suggestion_review';

export type DosageDecisionCategory =
  | 'block_pbm'
  | 'postpone'
  | 'eligible_low'
  | 'eligible_moderate'
  | 'eligible_cautious'
  | 'specialized_deep'
  | 'reduce_final_epithelialization'
  | 'research_only'
  | 're_evaluate_plan'
  | 'suspend_reassess'
  | 'after_debridement_only'
  | 'open_wound_care'
  | 'not_sure';

export type DosageDoseRange =
  | 'none'
  | 'no_clinical_routine'
  | '1-2'
  | '1-3'
  | '2-4'
  | '2-6'
  | '2-and-2'
  | '2-and-3'
  | '3-4'
  | '3-6'
  | '4'
  | '4-8'
  | '6-9'
  | '6-10'
  | '12-20'
  | 'by_area'
  | 'custom';

export type DosageWavelength =
  | 'none'
  | 'no_clinical_routine'
  | 'red_630_685'
  | 'red_660'
  | 'infrared_808'
  | 'infrared_808_830'
  | 'infrared_808_904'
  | 'combined_red_infrared'
  | 'red_660_infrared'
  | 'infrared_bed_red_edges'
  | 'blue_405'
  | 'not_sure';

export interface DosageContext {
  tissue?: {
    epithelial?: number;
    slough?: number;
    granulation?: number;
    necrotic?: number;
    dominant?: string;
  };
  exudate?: {
    amount?: 'none' | 'low' | 'medium' | 'high' | string;
    type?: string;
  };
  flags?: {
    infectionSigns?: boolean;
    criticalIschemia?: boolean;
    perfusionConcern?: boolean;
    deepWound?: boolean;
    extensiveNecrosis?: boolean;
    gangrene?: boolean;
    suspectedOsteomyelitis?: boolean;
    finalEpithelialization?: boolean;
    chronicStagnant?: boolean;
    superficialClean?: boolean;
    adequateGranulation?: boolean;
    intactAtRiskSkin?: boolean;
  };
  modelOutputs?: {
    pwatScore?: number;
    slic?: unknown;
    cnn?: unknown;
    vlm?: unknown;
  };
}

export interface DosageRuleSuggestion {
  decisionCategory: DosageDecisionCategory;
  doseRange: DosageDoseRange;
  wavelength: DosageWavelength;
  rationale: string;
  sourceRule: string;
}

export interface DosageAssignment {
  imageName: string;
  presentationMode: PresentationMode;
  assignmentSequence: number;
  totalCount: number;
  totalAssignmentCount: number;
  completedCount: number;
  skippedCount: number;
  remainingCount: number;
}

export interface DosageFeedbackPayload {
  username: string;
  image_name: string;
  presentation_mode: PresentationMode;
  assignment_sequence: number;
  decision_category: DosageDecisionCategory;
  dose_range: DosageDoseRange;
  custom_dose?: string | null;
  wavelength: DosageWavelength;
  accepted_suggestion?: boolean | null;
  edited_fields?: string[] | null;
  shown_context?: DosageContext | null;
  shown_suggestion?: DosageRuleSuggestion | null;
  dosage_obs?: string | null;
  applied_lasers_json?: {
    red: number;
    infrared: number;
    blue: number;
  } | null;
}
