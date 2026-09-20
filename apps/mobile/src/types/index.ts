export type Role = 'CLIENT' | 'DRIVER';
export type IssueType = 'ENGINE' | 'FLAT_TIRE' | 'BATTERY' | 'ACCIDENT' | 'CHAIN' | 'OTHER';
export type BookingStatus = 'DRAFT' | 'PAYMENT_PENDING' | 'SEARCHING' | 'SCHEDULED' | 'ASSIGNED' | 'DRIVER_EN_ROUTE' | 'DRIVER_ARRIVED' | 'PICKED_UP' | 'IN_TRANSIT' | 'DELIVERED' | 'COMPLETED' | 'CANCELLED' | 'PAYMENT_FAILED';
export type PaymentMethod = 'CARD' | 'CASH';

export type User = { id: string; phone: string; firstName?: string; email?: string; role: Role; isAvailable?: boolean; pushToken?: string };
export type Vehicle = { id: string; brand: string; model: string; plate?: string; year?: number };
export type Place = { address: string; latitude: number; longitude: number };
export type Message = { id: string; body: string; senderId: string; createdAt: string; sender?: User };
export type Photo = { id: string; kind: 'CLIENT' | 'PICKUP' | 'DELIVERY' | 'INCIDENT'; url: string };
export type Booking = {
  id: string; reference: string; clientId: string; driverId?: string; vehicleId?: string;
  issueType: IssueType; issueDescription?: string; status: BookingStatus;
  pickupAddress: string; pickupLatitude: number; pickupLongitude: number;
  destinationAddress: string; destinationLatitude: number; destinationLongitude: number;
  distanceKm: number; scheduledFor?: string; estimatedPriceCents: number; finalPriceCents?: number;
  paymentMethod: PaymentMethod; paymentStatus?: 'PENDING' | 'AUTHORIZED' | 'PAID' | 'FAILED';
  createdAt: string; completedAt?: string; client?: User; driver?: User; vehicle?: Vehicle;
  messages?: Message[]; photos?: Photo[]; invoice?: { number: string };
};

export type RootStackParamList = {
  Splash: undefined; Onboarding: undefined; PhoneLogin: undefined; Otp: { phone: string };
  ClientHome: undefined; LocationPermission: undefined; IssueChoice: undefined; VehicleInfo: undefined;
  RouteChoice: undefined; Schedule: undefined; Quote: undefined; Searching: { bookingId: string };
  ClientTracking: { bookingId: string }; ClientCompleted: { bookingId: string }; Invoice: { bookingId: string };
  ClientHistory: undefined; ClientProfile: undefined; Support: undefined; Chat: { bookingId: string };
  DriverHome: undefined; MissionOffer: { bookingId: string }; DriverNavigation: { bookingId: string };
  DriverArrival: { bookingId: string }; PickupPhotos: { bookingId: string }; Transport: { bookingId: string };
  Delivery: { bookingId: string }; MissionSummary: { bookingId: string }; DriverHistory: undefined;
  DriverEarnings: undefined; DriverProfile: undefined; DriverDocuments: undefined;
};

export type BookingDraft = {
  issueType?: IssueType; issueDescription?: string; brand: string; model: string; plate: string;
  photos: string[]; pickup?: Place; destination?: Place; distanceKm: number; scheduledFor?: Date;
};
