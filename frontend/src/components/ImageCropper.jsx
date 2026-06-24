import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export default function ImageCropper({
  file,
  aspect = 1,
  outputWidth = 800,
  onCropped,
  onError,
}) {
  const containerRef = useRef(null);
  const imgRef = useRef(null);
  const [imageUrl, setImageUrl] = useState("");
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragOrigin = useRef({ x: 0, y: 0 });
  const offsetOrigin = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!file) {
      setImageUrl("");
      setNaturalSize({ width: 0, height: 0 });
      setZoom(1);
      setOffset({ x: 0, y: 0 });
      return;
    }
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    let frame = null;
    const updateSize = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setDisplaySize({ width: rect.width, height: rect.height });
    };
    const scheduleUpdate = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        updateSize();
      });
    };
    scheduleUpdate();
    const observer = new ResizeObserver(scheduleUpdate);
    observer.observe(containerRef.current);
    return () => {
      if (frame) {
        cancelAnimationFrame(frame);
      }
      observer.disconnect();
    };
  }, []);

  const displayRatio = useMemo(() => {
    if (!displaySize.width || !displaySize.height) return 1;
    return displaySize.width / outputWidth;
  }, [displaySize, outputWidth]);

  const handleImageLoad = (event) => {
    const img = event.currentTarget;
    setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
  };

  const baseScale = useMemo(() => {
    if (!naturalSize.width || !naturalSize.height) return 1;
    if (!displaySize.width || !displaySize.height) return 1;
    return Math.max(
      displaySize.width / naturalSize.width,
      displaySize.height / naturalSize.height
    );
  }, [naturalSize, displaySize]);

  const maxOffset = useMemo(() => {
    if (!naturalSize.width || !naturalSize.height) return { x: 0, y: 0 };
    const scaledWidth = naturalSize.width * baseScale * zoom;
    const scaledHeight = naturalSize.height * baseScale * zoom;
    const maxX = Math.max(0, (scaledWidth - displaySize.width) / 2);
    const maxY = Math.max(0, (scaledHeight - displaySize.height) / 2);
    return { x: maxX, y: maxY };
  }, [naturalSize, baseScale, zoom, displaySize]);

  useEffect(() => {
    setOffset((prev) => ({
      x: clamp(prev.x, -maxOffset.x, maxOffset.x),
      y: clamp(prev.y, -maxOffset.y, maxOffset.y),
    }));
  }, [maxOffset]);

  const handlePointerDown = (event) => {
    if (!imageUrl) return;
    event.preventDefault();
    setDragging(true);
    dragOrigin.current = { x: event.clientX, y: event.clientY };
    offsetOrigin.current = { ...offset };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event) => {
    if (!dragging) return;
    const dx = event.clientX - dragOrigin.current.x;
    const dy = event.clientY - dragOrigin.current.y;
    const next = {
      x: clamp(offsetOrigin.current.x + dx, -maxOffset.x, maxOffset.x),
      y: clamp(offsetOrigin.current.y + dy, -maxOffset.y, maxOffset.y),
    };
    setOffset(next);
  };

  const handlePointerUp = () => {
    setDragging(false);
  };

  useEffect(() => {
    if (!imageUrl || !naturalSize.width || !displaySize.width) return;
    const img = imgRef.current;
    if (!img) return;
    const outputHeight = Math.round(outputWidth / aspect);
    const canvas = document.createElement("canvas");
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const baseScaleOut = Math.max(
      outputWidth / naturalSize.width,
      outputHeight / naturalSize.height
    );
    const scale = baseScaleOut * zoom;
    const offsetOut = {
      x: displaySize.width ? (offset.x / displaySize.width) * outputWidth : 0,
      y: displaySize.height ? (offset.y / displaySize.height) * outputHeight : 0,
    };
    const imgX = outputWidth / 2 + offsetOut.x - (naturalSize.width * scale) / 2;
    const imgY =
      outputHeight / 2 + offsetOut.y - (naturalSize.height * scale) / 2;

    ctx.setTransform(scale, 0, 0, scale, imgX, imgY);
    ctx.drawImage(img, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const type =
      file?.type && file.type.startsWith("image/")
        ? file.type
        : "image/jpeg";
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          onError?.("Failed to prepare image.");
          return;
        }
        onCropped?.(blob);
      },
      type,
      0.9
    );
  }, [
    imageUrl,
    naturalSize,
    displaySize,
    zoom,
    offset,
    aspect,
    outputWidth,
    file,
    onCropped,
    onError,
  ]);

  return (
    <div className="image-cropper">
      <div
        ref={containerRef}
        className="image-cropper-stage"
        style={{ aspectRatio: String(aspect) }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        role="presentation"
      >
        {imageUrl ? (
          <img
            ref={imgRef}
            src={imageUrl}
            alt="Crop preview"
            onLoad={handleImageLoad}
            style={{
              transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${baseScale * zoom})`,
            }}
          />
        ) : (
          <div className="image-cropper-placeholder">Select an image</div>
        )}
      </div>
      <div className="image-cropper-controls">
        <label>
          Zoom
          <input
            type="range"
            min="1"
            max="3"
            step="0.01"
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
            disabled={!imageUrl}
          />
        </label>
      </div>
    </div>
  );
}
