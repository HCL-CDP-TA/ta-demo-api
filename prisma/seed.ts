import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  // Create shopping centres
  console.log('Creating shopping centres...')
  const westfield = await prisma.shoppingCentre.upsert({
    where: { name: 'Westfield Mall' },
    update: {},
    create: {
      name: 'Westfield Mall',
      geofenceId: 'geofence-001',
      address: '10250 Santa Monica Blvd',
      city: 'Los Angeles',
      state: 'CA',
      zipCode: '90067',
      businessHours: {
        monday: { open: '09:00', close: '21:00' },
        tuesday: { open: '09:00', close: '21:00' },
        wednesday: { open: '09:00', close: '21:00' },
        thursday: { open: '09:00', close: '21:00' },
        friday: { open: '09:00', close: '22:00' },
        saturday: { open: '10:00', close: '22:00' },
        sunday: { open: '10:00', close: '20:00' }
      }
    }
  })

  // Create stores
  console.log('Creating stores...')
  await prisma.store.upsert({
    where: {
      shoppingCentreId_name: {
        shoppingCentreId: westfield.id,
        name: 'Zara'
      }
    },
    update: {},
    create: {
      shoppingCentreId: westfield.id,
      name: 'Zara',
      location: 'Level 2, Zone A',
      phoneNumber: '+1-800-ZARA',
      email: 'westfield@zara.com'
    }
  })

  await prisma.store.upsert({
    where: {
      shoppingCentreId_name: {
        shoppingCentreId: westfield.id,
        name: 'H&M'
      }
    },
    update: {},
    create: {
      shoppingCentreId: westfield.id,
      name: 'H&M',
      location: 'Level 1, Zone B',
      phoneNumber: '+1-855-466-7467',
      email: 'westfield@hm.com'
    }
  })

  console.log('✅ Seeding completed!')
  console.log('   Created 1 shopping centre with 2 stores')
  console.log('')
  console.log('Note: User, Product, and Wishlist data now comes from HCL Commerce API')
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
