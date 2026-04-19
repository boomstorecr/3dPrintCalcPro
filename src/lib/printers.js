import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';

export const PRINTER_PRESETS = [
  // Bambu Lab
  {
    name: 'Bambu Lab X1 Carbon',
    brand: 'Bambu Lab',
    type: 'FDM',
    wattage: 350,
    hourlyAmortizationFee: 0.75,
    defaultProfitMargin: 0.30,
    defaultFailureMargin: 0.05,
  },
  {
    name: 'Bambu Lab P1S',
    brand: 'Bambu Lab',
    type: 'FDM',
    wattage: 350,
    hourlyAmortizationFee: 0.50,
    defaultProfitMargin: 0.30,
    defaultFailureMargin: 0.05,
  },
  {
    name: 'Bambu Lab P1P',
    brand: 'Bambu Lab',
    type: 'FDM',
    wattage: 350,
    hourlyAmortizationFee: 0.35,
    defaultProfitMargin: 0.30,
    defaultFailureMargin: 0.05,
  },
  {
    name: 'Bambu Lab A1',
    brand: 'Bambu Lab',
    type: 'FDM',
    wattage: 150,
    hourlyAmortizationFee: 0.20,
    defaultProfitMargin: 0.30,
    defaultFailureMargin: 0.05,
  },
  {
    name: 'Bambu Lab A1 Mini',
    brand: 'Bambu Lab',
    type: 'FDM',
    wattage: 150,
    hourlyAmortizationFee: 0.15,
    defaultProfitMargin: 0.30,
    defaultFailureMargin: 0.05,
  },

  // Prusa
  {
    name: 'Prusa MK4S',
    brand: 'Prusa',
    type: 'FDM',
    wattage: 200,
    hourlyAmortizationFee: 0.45,
    defaultProfitMargin: 0.30,
    defaultFailureMargin: 0.05,
  },
  {
    name: 'Prusa XL (Single Tool)',
    brand: 'Prusa',
    type: 'FDM',
    wattage: 350,
    hourlyAmortizationFee: 1.00,
    defaultProfitMargin: 0.30,
    defaultFailureMargin: 0.05,
  },
  {
    name: 'Prusa Mini+',
    brand: 'Prusa',
    type: 'FDM',
    wattage: 120,
    hourlyAmortizationFee: 0.20,
    defaultProfitMargin: 0.30,
    defaultFailureMargin: 0.05,
  },
  {
    name: 'Prusa Core One',
    brand: 'Prusa',
    type: 'FDM',
    wattage: 250,
    hourlyAmortizationFee: 0.55,
    defaultProfitMargin: 0.30,
    defaultFailureMargin: 0.05,
  },

  // Creality
  {
    name: 'Creality Ender 3 V3',
    brand: 'Creality',
    type: 'FDM',
    wattage: 270,
    hourlyAmortizationFee: 0.15,
    defaultProfitMargin: 0.30,
    defaultFailureMargin: 0.08,
  },
  {
    name: 'Creality K1',
    brand: 'Creality',
    type: 'FDM',
    wattage: 350,
    hourlyAmortizationFee: 0.25,
    defaultProfitMargin: 0.30,
    defaultFailureMargin: 0.07,
  },
  {
    name: 'Creality K1 Max',
    brand: 'Creality',
    type: 'FDM',
    wattage: 450,
    hourlyAmortizationFee: 0.40,
    defaultProfitMargin: 0.30,
    defaultFailureMargin: 0.07,
  },
  {
    name: 'Creality CR-10 SE',
    brand: 'Creality',
    type: 'FDM',
    wattage: 350,
    hourlyAmortizationFee: 0.20,
    defaultProfitMargin: 0.30,
    defaultFailureMargin: 0.08,
  },

  // Anycubic
  {
    name: 'Anycubic Kobra 2',
    brand: 'Anycubic',
    type: 'FDM',
    wattage: 400,
    hourlyAmortizationFee: 0.15,
    defaultProfitMargin: 0.30,
    defaultFailureMargin: 0.08,
  },
  {
    name: 'Anycubic Kobra 3',
    brand: 'Anycubic',
    type: 'FDM',
    wattage: 400,
    hourlyAmortizationFee: 0.25,
    defaultProfitMargin: 0.30,
    defaultFailureMargin: 0.06,
  },
  {
    name: 'Anycubic Kobra S2 Plus',
    brand: 'Anycubic',
    type: 'FDM',
    wattage: 450,
    hourlyAmortizationFee: 0.30,
    defaultProfitMargin: 0.30,
    defaultFailureMargin: 0.06,
  },
  {
    name: 'Anycubic Kobra X',
    brand: 'Anycubic',
    type: 'FDM',
    wattage: 400,
    hourlyAmortizationFee: 0.15,
    defaultProfitMargin: 0.30,
    defaultFailureMargin: 0.07,
  },

  // Voron
  {
    name: 'Voron 2.4 (350mm)',
    brand: 'Voron',
    type: 'FDM',
    wattage: 400,
    hourlyAmortizationFee: 0.50,
    defaultProfitMargin: 0.30,
    defaultFailureMargin: 0.04,
  },
  {
    name: 'Voron Trident (300mm)',
    brand: 'Voron',
    type: 'FDM',
    wattage: 350,
    hourlyAmortizationFee: 0.40,
    defaultProfitMargin: 0.30,
    defaultFailureMargin: 0.04,
  },

  // Others
  {
    name: 'Elegoo Neptune 4 Pro',
    brand: 'Elegoo',
    type: 'FDM',
    wattage: 310,
    hourlyAmortizationFee: 0.15,
    defaultProfitMargin: 0.30,
    defaultFailureMargin: 0.07,
  },
  {
    name: 'Artillery Sidewinder X3 Plus',
    brand: 'Artillery',
    type: 'FDM',
    wattage: 500,
    hourlyAmortizationFee: 0.25,
    defaultProfitMargin: 0.30,
    defaultFailureMargin: 0.07,
  },
  {
    name: 'FlashForge Adventurer 5M',
    brand: 'FlashForge',
    type: 'FDM',
    wattage: 280,
    hourlyAmortizationFee: 0.20,
    defaultProfitMargin: 0.30,
    defaultFailureMargin: 0.06,
  },
  {
    name: 'FlashForge Adventurer 5M Pro',
    brand: 'FlashForge',
    type: 'FDM',
    wattage: 320,
    hourlyAmortizationFee: 0.30,
    defaultProfitMargin: 0.30,
    defaultFailureMargin: 0.06,
  },

  // Resin printers
  {
    name: 'Elegoo Saturn 4 Ultra',
    brand: 'Elegoo',
    type: 'Resin',
    wattage: 60,
    hourlyAmortizationFee: 0.30,
    defaultProfitMargin: 0.35,
    defaultFailureMargin: 0.10,
  },
  {
    name: 'Anycubic Photon Mono M7',
    brand: 'Anycubic',
    type: 'Resin',
    wattage: 54,
    hourlyAmortizationFee: 0.25,
    defaultProfitMargin: 0.35,
    defaultFailureMargin: 0.10,
  },
  {
    name: 'Prusa SL1S Speed',
    brand: 'Prusa',
    type: 'Resin',
    wattage: 100,
    hourlyAmortizationFee: 0.80,
    defaultProfitMargin: 0.35,
    defaultFailureMargin: 0.08,
  },
];

// Get all printers for a company
export async function getPrinters(companyId) {
  const q = query(collection(db, 'printers'), where('company_id', '==', companyId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((snapshotDoc) => ({ id: snapshotDoc.id, ...snapshotDoc.data() }));
}

// Create a new printer (from preset or custom)
export async function createPrinter(data) {
  // data should include: company_id, name, brand, type, wattage, hourly_amortization_fee, profit_margin, failure_margin
  const docRef = await addDoc(collection(db, 'printers'), {
    ...data,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  });
  return docRef.id;
}

// Create printer from a preset
export async function createPrinterFromPreset(companyId, preset) {
  return createPrinter({
    company_id: companyId,
    name: preset.name,
    brand: preset.brand,
    type: preset.type,
    wattage: preset.wattage,
    hourly_amortization_fee: preset.hourlyAmortizationFee,
    profit_margin: preset.defaultProfitMargin,
    failure_margin: preset.defaultFailureMargin,
  });
}

// Update a printer
export async function updatePrinter(printerId, data) {
  const printerRef = doc(db, 'printers', printerId);
  await updateDoc(printerRef, {
    ...data,
    updated_at: serverTimestamp(),
  });
}

// Delete a printer
export async function deletePrinter(printerId) {
  const printerRef = doc(db, 'printers', printerId);
  await deleteDoc(printerRef);
}
