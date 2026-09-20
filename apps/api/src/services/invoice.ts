import type { Booking, User, Vehicle } from '@prisma/client';
import PDFDocument from 'pdfkit';
import { env } from '../config/env.js';

type InvoiceBooking = Booking & { client: User; vehicle: Vehicle | null };

export function createInvoicePdf(booking: InvoiceBooking, invoiceNumber: string) {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  doc.fontSize(22).fillColor('#F6C400').text('MEHDI DÉPANNAGE');
  doc.fillColor('#111827').fontSize(10).text(env.COMPANY_ADDRESS).text(`SIRET : ${env.COMPANY_SIRET}`);
  doc.moveDown(2).fontSize(18).text(`Facture ${invoiceNumber}`);
  doc.fontSize(10).text(`Date : ${new Date().toLocaleDateString('fr-FR')}`);
  doc.text(`Client : ${booking.client.firstName ?? booking.client.phone}`);
  doc.text(`Intervention : ${booking.reference}`);
  doc.text(`Règlement : ${booking.paymentMethod === 'CASH' ? 'Espèces' : 'Carte bancaire'}`);
  doc.moveDown().fontSize(12).text('Détails');
  doc.fontSize(10).text(`Type de panne : ${booking.issueType}`);
  doc.text(`Départ : ${booking.pickupAddress}`);
  doc.text(`Destination : ${booking.destinationAddress}`);
  if (booking.vehicle) doc.text(`Moto : ${booking.vehicle.brand} ${booking.vehicle.model}`);
  doc.moveDown(2).fontSize(16).text(`Total TTC : ${((booking.finalPriceCents ?? booking.estimatedPriceCents) / 100).toFixed(2)} €`, { align: 'right' });
  doc.moveDown(3).fontSize(9).fillColor('#6B7280').text('Merci pour votre confiance. Votre moto, notre engagement.', { align: 'center' });
  doc.end();
  return doc;
}
