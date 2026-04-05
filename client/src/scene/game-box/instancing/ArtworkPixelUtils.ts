/**
 * Utility for resizing pixel data.
 */

/**
 * Resize pixel data using a simple box-sampling approach.
 * 
 * @param src Source pixel data (RGBA)
 * @param srcWidth Source width
 * @param srcHeight Source height
 * @param dstWidth Target width
 * @param dstHeight Target height
 * @returns Resized pixel data (RGBA)
 */
export function resizePixels(
    src: Uint8ClampedArray,
    srcWidth: number,
    srcHeight: number,
    dstWidth: number,
    dstHeight: number
): Uint8ClampedArray {
    const dst = new Uint8ClampedArray(dstWidth * dstHeight * 4)
    const scaleX = srcWidth / dstWidth
    const scaleY = srcHeight / dstHeight
    
    for (let dstY = 0; dstY < dstHeight; dstY++) {
        for (let dstX = 0; dstX < dstWidth; dstX++) {
            const srcX0 = Math.floor(dstX * scaleX)
            const srcY0 = Math.floor(dstY * scaleY)
            const srcX1 = Math.min(Math.ceil((dstX + 1) * scaleX), srcWidth)
            const srcY1 = Math.min(Math.ceil((dstY + 1) * scaleY), srcHeight)
            
            let r = 0, g = 0, b = 0, a = 0, count = 0
            for (let sy = srcY0; sy < srcY1; sy++) {
                for (let sx = srcX0; sx < srcX1; sx++) {
                    const srcIdx = (sy * srcWidth + sx) * 4
                    r += src[srcIdx]
                    g += src[srcIdx + 1]
                    b += src[srcIdx + 2]
                    a += src[srcIdx + 3]
                    count++
                }
            }
            
            const dstIdx = (dstY * dstWidth + dstX) * 4
            if (count > 0) {
                dst[dstIdx] = Math.round(r / count)
                dst[dstIdx + 1] = Math.round(g / count)
                dst[dstIdx + 2] = Math.round(b / count)
                dst[dstIdx + 3] = Math.round(a / count)
            }
        }
    }
    
    return dst
}
