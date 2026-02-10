import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadDir = path.join(__dirname, '../public/uploads');

if (fs.existsSync(uploadDir)) {
    console.log(`Cleaning up ${uploadDir}...`);
    fs.readdirSync(uploadDir).forEach((file) => {
        const filePath = path.join(uploadDir, file);
        fs.unlinkSync(filePath);
    });
    console.log('Cleanup complete.');
} else {
    console.log(`${uploadDir} does not exist, creating it...`);
    fs.mkdirSync(uploadDir, { recursive: true });
}
