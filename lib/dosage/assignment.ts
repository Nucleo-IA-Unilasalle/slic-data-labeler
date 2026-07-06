import type { PresentationMode } from './types';

export const MIN_REPEAT_GAP = 20;
export const REQUIRED_PRESENTATION_MODES: PresentationMode[] = ['blind', 'context', 'suggestion_review'];

export interface PriorAssignment {
  image_name: string;
  presentation_mode: PresentationMode;
  assignment_sequence: number;
  skipped: boolean;
}

function getAssignmentsForImage(assignments: PriorAssignment[], imageName: string): PriorAssignment[] {
  return assignments.filter((assignment) => assignment.image_name === imageName);
}

function hasImageMode(assignments: PriorAssignment[], imageName: string, mode: PresentationMode): boolean {
  return assignments.some(
    (assignment) => assignment.image_name === imageName && assignment.presentation_mode === mode
  );
}

function getLastAssignment(assignments: PriorAssignment[]): PriorAssignment | null {
  if (assignments.length === 0) return null;
  return assignments.reduce((latest, assignment) =>
    assignment.assignment_sequence > latest.assignment_sequence ? assignment : latest
  );
}

export function countRemainingAssignments(allImages: string[], assignments: PriorAssignment[]): number {
  return allImages.reduce((remaining, image) => {
    const missingModes = REQUIRED_PRESENTATION_MODES.filter((mode) => !hasImageMode(assignments, image, mode));
    return remaining + missingModes.length;
  }, 0);
}

export function choosePresentationMode(allImages: string[], assignments: PriorAssignment[]): PresentationMode | null {
  const missingByMode: Record<PresentationMode, number> = {
    blind: 0,
    context: 0,
    suggestion_review: 0,
  };

  for (const image of allImages) {
    for (const mode of REQUIRED_PRESENTATION_MODES) {
      if (!hasImageMode(assignments, image, mode)) {
        missingByMode[mode] += 1;
      }
    }
  }

  const modesWithRemaining = REQUIRED_PRESENTATION_MODES.filter((mode) => missingByMode[mode] > 0);
  if (modesWithRemaining.length === 0) return null;

  return modesWithRemaining.sort((a, b) => missingByMode[b] - missingByMode[a])[0];
}

export function getNextAssignmentSequence(assignments: PriorAssignment[]): number {
  if (assignments.length === 0) return 1;
  return Math.max(...assignments.map((assignment) => assignment.assignment_sequence)) + 1;
}

export function selectEligibleImage(
  allImages: string[],
  assignments: PriorAssignment[],
  mode: PresentationMode,
  minRepeatGap = MIN_REPEAT_GAP
): string | null {
  const currentSequence = getNextAssignmentSequence(assignments);

  const missingModeImages = allImages.filter((image) => !hasImageMode(assignments, image, mode));
  if (missingModeImages.length === 0) return null;

  const neverSeen = missingModeImages.filter((image) => getAssignmentsForImage(assignments, image).length === 0);
  if (neverSeen.length > 0) {
    return neverSeen[Math.floor(Math.random() * neverSeen.length)];
  }

  const outsideRepeatGap = missingModeImages.filter((image) => {
    const lastAssignment = getLastAssignment(getAssignmentsForImage(assignments, image));
    return lastAssignment === null || currentSequence - lastAssignment.assignment_sequence > minRepeatGap;
  });

  if (outsideRepeatGap.length > 0) {
    return outsideRepeatGap[Math.floor(Math.random() * outsideRepeatGap.length)];
  }

  // Do not mark the study complete just because all remaining images are inside the repeat gap.
  return missingModeImages[Math.floor(Math.random() * missingModeImages.length)];
}
