/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/* tslint:disable */
// Copyright 2024 Google LLC

// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at

//     https://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {GeneratedImage, GeneratedVideo, GoogleGenAI} from '@google/genai';
import {useEffect, useRef, useState} from 'react';
import ReactDOM from 'react-dom/client';
import {
  AssetRecordType,
  Box,
  createShapeId,
  Editor,
  stopEventPropagation,
  Tldraw,
  TldrawProps,
  TldrawUiButton,
  TldrawUiButtonIcon,
  TldrawUiContextualToolbar,
  // FIX: Import TLShapeId to correctly type shape IDs.
  TLShapeId,
  TLTextShape,
  toRichText,
  track,
  useEditor,
  usePassThroughWheelEvents,
  useToasts,
} from 'tldraw';
import {Chatbot} from './Components/Chatbot';
import {GettingStarted} from './Components/GettingStarted';
import {NoticeBanner} from './Components/NoticeBanner';
import {PromptBar} from './Components/PromptBar';
import {
  addPlaceholder,
  bloblToBase64,
  createArrowBetweenShapes,
  loadIcon,
  placeNewShape,
  VIDEO_HEIGHT,
  VIDEO_WIDTH,
} from './utils';

const ai = new GoogleGenAI({apiKey: process.env.API_KEY});

const GEMINI_MODEL_NAME = 'gemini-2.5-flash';
const IMAGEN_MODEL_NAME = 'imagen-4.0-fast-generate-001';
const GEMINI_IMAGE_MODEL_NAME = 'gemini-2.5-flash-image-preview';
const VEO_MODEL_NAME = 'veo-3.0-fast-generate-001';

async function describeImage(imageBlob: Blob): Promise<string> {
  const imageDataBase64 = await bloblToBase64(imageBlob);

  const textPrompt = `Describe the image`;

  const imagePrompt = {
    inlineData: {
      data: imageDataBase64,
      mimeType: 'image/jpeg',
    },
  };

  const result = await ai.models.generateContent({
    model: GEMINI_MODEL_NAME,
    contents: {parts: [{text: textPrompt}, imagePrompt]},
  });
  return result.text;
}

async function generateImages(
  prompt: string,
  imageBlob: Blob = null,
  numberOfImages = 1,
): Promise<string[]> {
  const imageObjects = [];

  if (imageBlob) {
    const imageDataBase64 = await bloblToBase64(imageBlob);
    const mimeType =
      imageDataBase64.match(/data:(.*);base64,/)?.[1] || 'image/jpeg';

    const imagePart = {inlineData: {mimeType, data: imageDataBase64}};
    const textPart = {text: prompt};

    const res = await ai.models.generateContent({
      model: GEMINI_IMAGE_MODEL_NAME,
      contents: {parts: [imagePart, textPart]},
    });

    const imagePartRes = res.candidates?.[0]?.content?.parts?.find(
      (p) => p.inlineData,
    );
    if (imagePartRes && imagePartRes.inlineData) {
      const src = `data:${imagePartRes.inlineData.mimeType};base64,${imagePartRes.inlineData.data}`;
      imageObjects.push(src);
    } else {
      throw new Error(`No image data found for prompt: ${prompt}`);
    }
  } else {
    const response = await ai.models.generateImages({
      model: IMAGEN_MODEL_NAME,
      prompt,
      config: {
        numberOfImages,
        aspectRatio: '16:9',
        outputMimeType: 'image/jpeg',
      },
    });

    if (response?.generatedImages) {
      response.generatedImages.forEach(
        (generatedImage: GeneratedImage, index: number) => {
          if (generatedImage.image?.imageBytes) {
            const src = `data:image/jpeg;base64,${generatedImage.image.imageBytes}`;
            imageObjects.push(src);
          }
        },
      );
    }
  }

  return imageObjects;
}

async function generateVideo(
  imageBlob: Blob,
  prompt: string,
  numberOfVideos = 1,
): Promise<string[]> {
  let operation = null;
  if (imageBlob) {
    const imageDataBase64 = await bloblToBase64(imageBlob);
    const image = {
      imageBytes: imageDataBase64,
      mimeType: 'image/png',
    };
    operation = await ai.models.generateVideos({
      model: VEO_MODEL_NAME,
      prompt,
      image,
      config: {
        numberOfVideos,
        aspectRatio: '16:9',
      },
    });
  } else {
    operation = await ai.models.generateVideos({
      model: VEO_MODEL_NAME,
      prompt,
      config: {
        numberOfVideos,
        aspectRatio: '16:9',
      },
    });
  }

  while (!operation.done) {
    await new Promise((resolve) => setTimeout(resolve, 10000));
    console.log('...Generating...');
    operation = await ai.operations.getVideosOperation({operation});
    console.log(operation, operation.error);
  }

  if (operation?.response) {
    const response = operation.response;
    console.log(response);

    if (
      response.raiMediaFilteredCount &&
      response.raiMediaFilteredReasons.length > 0
    ) {
      throw new Error(response.raiMediaFilteredReasons[0]);
    }

    if (operation?.response.generatedVideos) {
      return await Promise.all(
        response.generatedVideos.map(
          async (
            generatedVideo: GeneratedVideo,
            index: number,
            videos: GeneratedVideo[],
          ) => {
            const url = decodeURIComponent(generatedVideo.video.uri);
            const res = await fetch(`${url}&key=${process.env.API_KEY}`);
            const blob = await res.blob();
            return bloblToBase64(blob);
          },
        ),
      );
    }
  }
  return [];
}

const describeClick = async (editor: Editor) => {
  console.log('describe');
  const shapes = editor.getSelectedShapes();
  shapes
    .filter((shape) => editor.isShapeOfType(shape, 'image'))
    .forEach(async (shape) => {
      console.log('selected image shape:', shape.id);

      const placeholderIds = addPlaceholder(
        editor,
        'Generating description...',
      );
      editor.select(placeholderIds[0]);
      editor.zoomToSelectionIfOffscreen(20);

      // Export as PNG blob
      const shapeExport = await editor.toImage([shape.id], {
        format: 'png',
        scale: 1,
        background: true,
      });

      const response = await describeImage(shapeExport.blob);

      editor.deleteShapes(placeholderIds);

      const textShapeId = createShapeId();
      editor.createShape({
        id: textShapeId,
        type: 'text',
        props: {
          richText: toRichText(response),
          autoSize: false,
          w: VIDEO_WIDTH,
        },
      });

      const newShape = editor.getShape(textShapeId);

      if (!newShape) return;

      placeNewShape(editor, newShape);
      createArrowBetweenShapes(editor, shape.id, newShape.id);
    });
};

const genImageClick = async (editor: Editor) => {
  console.log('generate image');
  const shapes = editor.getSelectedShapes();
  const contents: string[] = [];
  const images = [];

  // FIX: `sourceShapesId` must be of type `TLShapeId[]` to be compatible with `createArrowBetweenShapes`.
  const sourceShapesId: TLShapeId[] = [];

  await Promise.all(
    shapes
      .filter((shape) => editor.isShapeOfType(shape, 'text'))
      .map(async (shape) => {
        console.log('selected text shape:', shape.id);
        const selectedTextShape = editor.getShape<TLTextShape>(shape.id)!;
        console.log(selectedTextShape);
        const textParts = (selectedTextShape.props.richText.content as any[])
          .filter((p) => p.type === 'paragraph' && p.content?.length > 0)
          .map((p) => p.content.map((t: any) => t.text).join(''));
        contents.push(...textParts);
        sourceShapesId.push(shape.id);
      }),
  );

  const imageShapes = shapes.filter((shape) =>
    editor.isShapeOfType(shape, 'image'),
  );
  imageShapes.length = Math.min(1, imageShapes.length); // Max 1 image shape

  await Promise.all(
    imageShapes.map(async (shape) => {
      console.log('selected image shape:', shape.id);
      // Export as PNG blob
      const shapeExport = await editor.toImage([shape.id], {
        format: 'png',
        scale: 1,
        background: true,
      });
      images.push(shapeExport.blob);
      sourceShapesId.push(shape.id);
    }),
  );

  console.log(contents, images);
  if (contents.length === 0 && images.length === 0) return;

  const placeholderIds = addPlaceholder(editor, 'Generating image...');
  editor.select(placeholderIds[0]);
  editor.zoomToSelectionIfOffscreen(20);

  const promptText = contents.join('\n');
  const image = images.length > 0 ? images[0] : null;

  console.log('generating...', contents);
  let imageObjects = [];
  try {
    imageObjects = await generateImages(promptText, image);
  } catch (e) {
    editor.select(placeholderIds[0]);
    editor.deleteShapes(placeholderIds);
    throw new Error(e.message);
  }
  console.log('done.');

  editor.select(placeholderIds[0]);

  let bounds = editor.getSelectionPageBounds();

  const x = bounds.left;
  const y = bounds.top;
  const w = bounds.width;
  const h = bounds.height;

  editor.deleteShapes(placeholderIds);

  let lastId: TLShapeId = null;

  imageObjects.forEach((imgSrc, i) => {
    const assetId = AssetRecordType.createId();

    editor.createAssets([
      {
        id: assetId,
        type: 'image',
        typeName: 'asset',
        props: {
          name: `sample_${i}_${assetId}.jpg`,
          src: imgSrc,
          w: VIDEO_WIDTH,
          h: VIDEO_HEIGHT,
          mimeType: 'image/jpeg',
          isAnimated: false,
        },
        meta: {},
      },
    ]);

    lastId = createShapeId();
    editor.createShape({
      id: lastId,
      type: 'image',
      x: x + i * 30,
      y: y + i * 30,
      props: {
        assetId,
        w,
        h,
      },
    });

    sourceShapesId.forEach((shapeId) => {
      createArrowBetweenShapes(editor, shapeId, lastId);
    });
  });

  if (lastId) {
    editor.select(lastId);
    editor.zoomToSelection({animation: {duration: 400}});
  }
};

const genVideoClick = async (editor: Editor) => {
  console.log('generate video');
  const shapes = editor.getSelectedShapes();
  const contents: string[] = [];
  const images = [];

  // FIX: `sourceShapesId` must be of type `TLShapeId[]` to be compatible with `createArrowBetweenShapes`.
  const sourceShapesId: TLShapeId[] = [];

  await Promise.all(
    shapes
      .filter((shape) => editor.isShapeOfType(shape, 'text'))
      .map(async (shape) => {
        console.log('selected text shape:', shape.id);
        const selectedTextShape = editor.getShape<TLTextShape>(shape.id)!;
        console.log(selectedTextShape);
        const textParts = (selectedTextShape.props.richText.content as any[])
          .filter((p) => p.type === 'paragraph' && p.content?.length > 0)
          .map((p) => p.content.map((t: any) => t.text).join(''));
        contents.push(...textParts);
        sourceShapesId.push(shape.id);
      }),
  );

  const imageShapes = shapes.filter((shape) =>
    editor.isShapeOfType(shape, 'image'),
  );
  imageShapes.length = Math.min(1, imageShapes.length); // Max 1 image shape

  await Promise.all(
    imageShapes.map(async (shape) => {
      console.log('selected image shape:', shape.id);
      // Export as PNG blob
      const shapeExport = await editor.toImage([shape.id], {
        format: 'png',
        scale: 1,
        background: true,
      });
      images.push(shapeExport.blob);
      sourceShapesId.push(shape.id);
    }),
  );

  console.log(contents, images);
  if (contents.length === 0 && images.length === 0) return;

  const placeholderIds = addPlaceholder(editor, 'Generating video...');
  editor.select(placeholderIds[0]);
  editor.zoomToSelectionIfOffscreen(20);

  console.log('generating...', contents);

  const promptText = contents.join('\n');
  const image = images.length > 0 ? images[0] : null;

  let videoObjects = [];
  try {
    videoObjects = await generateVideo(image, promptText);
  } catch (e) {
    editor.select(placeholderIds[0]);
    editor.deleteShapes(placeholderIds);
    throw new Error(e.message);
  }

  console.log('done.', videoObjects);

  editor.select(placeholderIds[0]);

  let bounds = editor.getSelectionPageBounds();

  const x = bounds.left;
  const y = bounds.top;
  const w = bounds.width;
  const h = bounds.height;

  editor.deleteShapes(placeholderIds);

  let lastId = createShapeId();

  videoObjects.forEach((videoSrc, i) => {
    const mimeType = 'video/mp4';
    const src = `data:${mimeType};base64,${videoSrc}`;
    const assetId = AssetRecordType.createId();
    editor.createAssets([
      {
        id: assetId,
        type: 'video',
        typeName: 'asset',
        props: {
          name: `sample_${i}_${assetId}.mp4`,
          src,
          w: VIDEO_WIDTH,
          h: VIDEO_HEIGHT,
          mimeType,
          isAnimated: true,
        },
        meta: {},
      },
    ]);
    editor.createShape({
      id: lastId,
      type: 'video',
      x: x + i * 30,
      y: y + i * 30,
      props: {
        assetId,
        w,
        h,
        playing: true,
      },
    });

    sourceShapesId.forEach((shapeId) => {
      createArrowBetweenShapes(editor, shapeId, lastId);
    });
  });

  if (lastId) {
    editor.select(lastId);
    editor.zoomToSelection({animation: {duration: 400}});
  }
};

const generateNewImage = async (
  editor: Editor,
  prompt: string,
  imgSrc: string,
) => {
  console.log('generateNewImage', prompt, imgSrc);

  const textShapeId = createShapeId();
  const imgShapeId = createShapeId();
  // FIX: Only select shapes that have been created.
  const idsToSelect: TLShapeId[] = [];

  // add image to canvas
  if (imgSrc) {
    const assetId = AssetRecordType.createId();

    editor.createAssets([
      {
        id: assetId,
        type: 'image',
        typeName: 'asset',
        props: {
          name: `uploaded_image_${assetId}.jpg`,
          src: imgSrc,
          w: VIDEO_WIDTH,
          h: VIDEO_HEIGHT,
          mimeType: 'image/jpeg',
          isAnimated: false,
        },
        meta: {},
      },
    ]);

    editor.createShape({
      id: imgShapeId,
      type: 'image',
      props: {
        assetId,
      },
    });

    const imgShape = editor.getShape(imgShapeId);
    placeNewShape(editor, imgShape!);
    idsToSelect.push(imgShapeId);
  }

  // add text to canvas
  if (prompt) {
    editor.createShape({
      id: textShapeId,
      type: 'text',
      props: {
        richText: toRichText(prompt),
        autoSize: true,
      },
    });

    const textShape = editor.getShape(textShapeId);
    placeNewShape(editor, textShape!);
    idsToSelect.push(textShapeId);
  }

  // select
  if (idsToSelect.length > 0) {
    editor.select(...idsToSelect);
    editor.zoomToSelection({animation: {duration: 400}});
  }

  // generate
  await genImageClick(editor);
};

const generateNewVideo = async (
  editor: Editor,
  prompt: string,
  imgSrc: string,
) => {
  console.log('generateNewVideo', prompt, imgSrc);

  const textShapeId = createShapeId();
  const imgShapeId = createShapeId();
  // FIX: Only select shapes that have been created.
  const idsToSelect: TLShapeId[] = [];

  // add image to canvas
  if (imgSrc) {
    const assetId = AssetRecordType.createId();

    editor.createAssets([
      {
        id: assetId,
        type: 'image',
        typeName: 'asset',
        props: {
          name: `uploaded_image_${assetId}.jpg`,
          src: imgSrc,
          w: VIDEO_WIDTH,
          h: VIDEO_HEIGHT,
          mimeType: 'image/jpeg',
          isAnimated: false,
        },
        meta: {},
      },
    ]);

    editor.createShape({
      id: imgShapeId,
      type: 'image',
      props: {
        assetId,
      },
    });

    const imgShape = editor.getShape(imgShapeId);
    placeNewShape(editor, imgShape!);
    idsToSelect.push(imgShapeId);
  }

  // add text to canvas
  if (prompt) {
    editor.createShape({
      id: textShapeId,
      type: 'text',
      props: {
        richText: toRichText(prompt),
        autoSize: true,
      },
    });

    const textShape = editor.getShape(textShapeId);
    placeNewShape(editor, textShape!);
    idsToSelect.push(textShapeId);
  }

  // select
  if (idsToSelect.length > 0) {
    editor.select(...idsToSelect);
    editor.zoomToSelection({animation: {duration: 400}});
  }

  // generate
  await genVideoClick(editor);
};

// ---

const assetUrls: TldrawProps['assetUrls'] = {
  icons: {
    'genai-describe-image': await loadIcon('/genai-describe-image.svg'),
    'genai-generate-image': await loadIcon('/genai-generate-image.svg'),
    'genai-generate-video': await loadIcon('/genai-generate-video.svg'),
  },
};

const OverlayComponent = track(() => {
  const editor = useEditor();
  const {addToast} = useToasts();
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
      }}
      onPointerDown={stopEventPropagation}>
      <ContextualToolbarComponent />
      <PromptBar
        onSubmit={async (prompt, image, action) => {
          try {
            if (action === 'video') {
              await generateNewVideo(editor, prompt, image);
            } else {
              await generateNewImage(editor, prompt, image);
            }
          } catch (e) {
            addToast({title: e.message, severity: 'error'});
          }
        }}
      />
    </div>
  );
});

const ContextualToolbarComponent = track(() => {
  const editor = useEditor();
  const {addToast} = useToasts();
  const showToolbar = editor.isIn('select.idle');

  const ref = useRef<HTMLDivElement>(null);
  usePassThroughWheelEvents(ref);

  if (!showToolbar) return <></>;

  const getSelectionBounds = () => {
    const fullBounds = editor.getSelectionRotatedScreenBounds();
    if (!fullBounds) return undefined;
    const box = new Box(
      fullBounds.x,
      fullBounds.y + fullBounds.height + 75,
      fullBounds.width,
      0,
    );
    return box;
  };

  const shapes = editor.getSelectedShapes();
  const textShapes = shapes.filter((shape) =>
    editor.isShapeOfType(shape, 'text'),
  );
  const imageShapes = shapes.filter((shape) =>
    editor.isShapeOfType(shape, 'image'),
  );
  const otherShapes = shapes.filter(
    (shape) =>
      !editor.isShapeOfType(shape, 'image') &&
      !editor.isShapeOfType(shape, 'text'),
  );

  const hasImage = imageShapes.length > 0;
  const hasText = textShapes.length > 0;
  const hasOtherShapes = otherShapes.length > 0;

  if (hasOtherShapes || (textShapes.length === 0 && imageShapes.length === 0))
    return;

  const actions = [];

  if (hasImage && !hasText) {
    actions.push({
      label: 'Describe',
      title: 'Describe image',
      icon: 'genai-describe-image',
      onClick: () => describeClick(editor),
    });
  }
  if (hasText && !hasImage) {
    actions.push({
      label: 'Generate image',
      title: 'Generate image from text',
      icon: 'genai-generate-image',
      onClick: () => genImageClick(editor),
    });
  }
  if (hasText && hasImage) {
    actions.push({
      label: 'Generate image',
      title: 'Generate image from image and text',
      icon: 'genai-generate-image',
      onClick: () => genImageClick(editor),
    });
  }
  if (hasText || hasImage) {
    actions.push({
      label: 'Generate video',
      title: 'Generate video from text and/or image',
      icon: 'genai-generate-video',
      onClick: async () => {
        try {
          await genVideoClick(editor);
        } catch (e) {
          addToast({title: e.message, severity: 'error'});
        }
      },
    });
  }
  if (hasOtherShapes) actions.length = 0;

  return (
    // FIX: The `ref` prop is not supported on TldrawUiContextualToolbar. It should be on the child div.
    <TldrawUiContextualToolbar
      getSelectionBounds={getSelectionBounds}
      label="GenAI">
      <div className="genai-actions-context" ref={ref}>
        {actions?.map(({label, title, icon, onClick}, i) => (
          <TldrawUiButton
            key={`${i}`}
            title={title}
            type="icon"
            onClick={onClick}>
            <TldrawUiButtonIcon small icon={icon} />
            {label}
          </TldrawUiButton>
        ))}
      </div>
    </TldrawUiContextualToolbar>
  );
});

// ---

export default function App() {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [showGettingStarted, setShowGettingStarted] = useState(false);
  const [isChatbotOpen, setIsChatbotOpen] = useState(false);

  useEffect(() => {
    // A more specific key to avoid conflicts with other starter apps
    const hasVisited = localStorage.getItem('hasVisitedGenAICanvas');
    if (!hasVisited) {
      setShowGettingStarted(true);
    }
  }, []);

  const handleCloseGettingStarted = () => {
    localStorage.setItem('hasVisitedGenAICanvas', 'true');
    setShowGettingStarted(false);
  };

  return (
    <>
      {showGettingStarted && (
        <GettingStarted onClose={handleCloseGettingStarted} />
      )}
      <NoticeBanner />
      <Tldraw
        inferDarkMode
        components={{
          InFrontOfTheCanvas: OverlayComponent,
        }}
        assetUrls={assetUrls}
        onMount={(editor) => {
          setEditor(editor);
          editor.user.updateUserPreferences({
            animationSpeed: 1,
          });
          editor.zoomToFit();
        }}
      />
      {!isChatbotOpen && (
        <button
          className="chatbot-toggle"
          onClick={() => setIsChatbotOpen(true)}
          aria-label="Open university assistant chat"
          title="University Assistant">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            height="24px"
            viewBox="0 0 24 24"
            width="24px"
            fill="#FFFFFF">
            <path d="M0 0h24v24H0V0z" fill="none" />
            <path d="M21 6h-2v9H6v2c0 .55.45 1 1 1h11l4 4V7c0-.55-.45-1-1-1zm-4 6V4c0-.55-.45-1-1-1H3c-.55 0-1 .45-1 1v14l4-4h10c.55 0 1-.45 1-1z" />
          </svg>
        </button>
      )}
      {isChatbotOpen && <Chatbot onClose={() => setIsChatbotOpen(false)} />}
    </>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
