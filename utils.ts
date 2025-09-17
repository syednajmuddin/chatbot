/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/* tslint:disable */

import {
  AssetRecordType,
  Box,
  createShapeId,
  DefaultToolbar,
  DefaultToolbarContent,
  Editor,
  stopEventPropagation,
  TLArrowBinding,
  TLArrowShape,
  Tldraw,
  TldrawProps,
  TldrawUiButton,
  TldrawUiButtonIcon,
  TldrawUiContextualToolbar,
  TldrawUiMenuItem,
  TLGeoShape,
  TLImageShape,
  TLShape,
  TLShapeId,
  TLTextShape,
  toRichText,
  track,
  useDialogs,
  useEditor,
  usePassThroughWheelEvents,
  useToasts,
  Vec,
} from 'tldraw';

export const VIDEO_WIDTH = 1280 / 2;
export const VIDEO_HEIGHT = 720 / 2;

const SPACING_BETWEEN_OBJECTS = 50;

export function bloblToBase64(blob: Blob) {
  return new Promise<string>(async (resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      resolve(url.split(',')[1]);
    };
    reader.readAsDataURL(blob);
  });
}

// https://tldraw.dev/examples/create-arrow
export function createArrowBetweenShapes(
  editor: Editor,
  startShapeId: TLShapeId,
  endShapeId: TLShapeId,
  options = {} as {
    parentId?: TLShapeId;
    start?: Partial<Omit<TLArrowBinding['props'], 'terminal'>>;
    end?: Partial<Omit<TLArrowBinding['props'], 'terminal'>>;
  },
) {
  const {start = {}, end = {}, parentId} = options;

  const {
    normalizedAnchor: startNormalizedAnchor = {x: 0.5, y: 0.5},
    isExact: startIsExact = false,
    isPrecise: startIsPrecise = false,
  } = start;
  const {
    normalizedAnchor: endNormalizedAnchor = {x: 0.5, y: 0.5},
    isExact: endIsExact = false,
    isPrecise: endIsPrecise = false,
  } = end;

  const startTerminalNormalizedPosition = Vec.From(startNormalizedAnchor);
  const endTerminalNormalizedPosition = Vec.From(endNormalizedAnchor);

  const parent = parentId ? editor.getShape(parentId) : undefined;
  if (parentId && !parent) {
    throw Error(`Parent shape with id ${parentId} not found`);
  }

  const startShapePageBounds = editor.getShapePageBounds(startShapeId);
  const endShapePageBounds = editor.getShapePageBounds(endShapeId);

  const startShapePageRotation = editor
    .getShapePageTransform(startShapeId)
    .rotation();
  const endShapePageRotation = editor
    .getShapePageTransform(endShapeId)
    .rotation();

  if (!startShapePageBounds || !endShapePageBounds) return;

  const startTerminalPagePosition = Vec.Add(
    startShapePageBounds.point,
    Vec.MulV(
      startShapePageBounds.size,
      Vec.Rot(startTerminalNormalizedPosition, startShapePageRotation),
    ),
  );
  const endTerminalPagePosition = Vec.Add(
    endShapePageBounds.point,
    Vec.MulV(
      startShapePageBounds.size,
      Vec.Rot(endTerminalNormalizedPosition, endShapePageRotation),
    ),
  );

  const arrowPointInParentSpace = Vec.Min(
    startTerminalPagePosition,
    endTerminalPagePosition,
  );
  if (parent) {
    arrowPointInParentSpace.setTo(
      editor
        .getShapePageTransform(parent.id)!
        .applyToPoint(arrowPointInParentSpace),
    );
  }

  const arrowId = createShapeId();
  editor.run(() => {
    editor.markHistoryStoppingPoint('creating_arrow');
    editor.createShape<TLArrowShape>({
      id: arrowId,
      type: 'arrow',
      x: arrowPointInParentSpace.x,
      y: arrowPointInParentSpace.y,
      props: {
        color: 'violet',
        dash: 'dashed',
        bend: 50,

        start: {
          x: arrowPointInParentSpace.x - startTerminalPagePosition.x,
          y: arrowPointInParentSpace.x - startTerminalPagePosition.x,
        },
        end: {
          x: arrowPointInParentSpace.x - endTerminalPagePosition.x,
          y: arrowPointInParentSpace.x - endTerminalPagePosition.x,
        },
      },
    });

    editor.createBindings<TLArrowBinding>([
      {
        fromId: arrowId,
        toId: startShapeId,
        type: 'arrow',
        props: {
          terminal: 'start',
          normalizedAnchor: startNormalizedAnchor,
          isExact: startIsExact,
          isPrecise: startIsPrecise,
        },
      },
      {
        fromId: arrowId,
        toId: endShapeId,
        type: 'arrow',
        props: {
          terminal: 'end',
          normalizedAnchor: endNormalizedAnchor,
          isExact: endIsExact,
          isPrecise: endIsPrecise,
        },
      },
    ]);
  });
}

export async function loadIcon(icon: string, mimeType = 'image/svg+xml') {
  const res = await fetch(icon);
  const blob = await res.blob();
  return `data:${mimeType};base64,${await bloblToBase64(blob)}`;
}

export function placeNewShape(editor: Editor, newShape: TLShape) {
  // https://tldraw.dev/examples/custom-paste
  const siblingIds = editor.getSortedChildIdsForParent(newShape.parentId);
  const newShapeBounds = editor.getShapePageBounds(newShape.id)!;
  let targetPosition = newShapeBounds.minX;

  const siblingBounds = siblingIds
    .map((id) => ({id, bounds: editor.getShapePageBounds(id)!}))
    .sort((a, b) => a.bounds.minX - b.bounds.minX);

  for (const sibling of siblingBounds) {
    if (sibling.id === newShape.id) continue;

    // if this sibling is above or below the copied frame, we don't need to take it into account
    if (
      sibling.bounds.minY > newShapeBounds.maxY ||
      sibling.bounds.maxY < newShapeBounds.minY
    ) {
      continue;
    }

    // if the sibling is to the left of the copied frame, we don't need to take it into account
    if (sibling.bounds.maxX < targetPosition) continue;

    // if the sibling is to the right of where the pasted frame would end up, we don't care about it
    if (sibling.bounds.minX > targetPosition + newShapeBounds.w) continue;

    // otherwise, we need to shift our target right edge to the right of this sibling
    targetPosition = sibling.bounds.maxX + SPACING_BETWEEN_OBJECTS;
  }

  // translate the pasted frame into position:
  editor.nudgeShapes([newShape.id], {
    x: targetPosition - newShapeBounds.minX,
    y: 0,
  });
}

export const addPlaceholder = (editor: Editor, message: string) => {
  let bounds = editor.getSelectionPageBounds();

  const placeholderIds = [createShapeId(), createShapeId()];
  editor.createShapes([
    {
      id: placeholderIds[0],
      type: 'geo',
      x: bounds.left,
      y: bounds.bottom + 100,
      props: {
        w: VIDEO_WIDTH,
        h: VIDEO_HEIGHT,
      },
    } as TLGeoShape,
    {
      id: placeholderIds[1],
      type: 'text',
      x: bounds.left + VIDEO_WIDTH / 2 - 100,
      y: bounds.bottom + 100 + VIDEO_HEIGHT / 2,
      props: {
        richText: toRichText(message),
      },
    },
  ]);
  const placeholderGroupId = createShapeId();
  editor.groupShapes(placeholderIds, {
    groupId: placeholderGroupId,
    select: false,
  });

  // Find empty space for the shape
  const newShape = editor.getShape(placeholderGroupId);
  placeNewShape(editor, newShape!);

  return [placeholderGroupId, ...placeholderIds];
};
