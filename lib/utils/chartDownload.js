import { toPng, toJpeg } from 'html-to-image';

/**
 * Download chart element as PNG
 * @param {HTMLElement} element - Chart container element
 * @param {string} filename - Filename without extension
 */
export async function downloadAsPNG(element, filename = 'chart') {
    try {
        const dataUrl = await toPng(element, {
            quality: 1,
            backgroundColor: '#ffffff',
            pixelRatio: 2 // Higher resolution
        });

        const link = document.createElement('a');
        link.download = `${filename}.png`;
        link.href = dataUrl;
        link.click();

        return { success: true };
    } catch (error) {
        console.error('Failed to download PNG:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Download chart element as JPEG
 * @param {HTMLElement} element - Chart container element
 * @param {string} filename - Filename without extension
 */
export async function downloadAsJPEG(element, filename = 'chart') {
    try {
        const dataUrl = await toJpeg(element, {
            quality: 0.95,
            backgroundColor: '#ffffff',
            pixelRatio: 2
        });

        const link = document.createElement('a');
        link.download = `${filename}.jpg`;
        link.href = dataUrl;
        link.click();

        return { success: true };
    } catch (error) {
        console.error('Failed to download JPEG:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Generate chart filename from title
 */
export function generateFilename(title) {
    if (!title) return 'chart';
    return title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
        .substring(0, 50);
}
