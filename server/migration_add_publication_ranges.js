/**
 * Migration Script: Add Publication Ranges to Existing Data
 */

import mongoose from 'mongoose';
import { PublicationRange, Vacancy, Candidate } from './models.js';

export async function runMigration() {
  try {
    console.log('🔄 Starting migration...');

    // Check if migration is needed
    const vacancyCount = await Vacancy.countDocuments();
    const candidateCount = await Candidate.countDocuments();
    const publicationRangeCount = await PublicationRange.countDocuments();

    console.log(`\n📊 Current Database State:`);
    console.log(`   Vacancies: ${vacancyCount}`);
    console.log(`   Candidates: ${candidateCount}`);
    console.log(`   Publication Ranges: ${publicationRangeCount}`);

    // Check if any vacancy lacks publicationRangeId
    const vacanciesNeedingMigration = await Vacancy.countDocuments({ 
      publicationRangeId: { $exists: false } 
    });
    
    const candidatesNeedingMigration = await Candidate.countDocuments({ 
      publicationRangeId: { $exists: false } 
    });

    if (vacanciesNeedingMigration === 0 && candidatesNeedingMigration === 0) {
      console.log('\n✅ No migration needed - all data already has publication ranges');
      return { success: true, migrated: false };
    }

    console.log(`\n🔍 Found data needing migration:`);
    console.log(`   Vacancies: ${vacanciesNeedingMigration}`);
    console.log(`   Candidates: ${candidatesNeedingMigration}`);

    // Create a default publication range for existing data
    console.log('\n📝 Creating default publication range for existing data...');
    
    let defaultPublicationRange = await PublicationRange.findOne({ 
      name: 'Legacy Data (Pre-Archive System)' 
    });

    if (!defaultPublicationRange) {
      defaultPublicationRange = new PublicationRange({
        name: 'Legacy Data (Pre-Archive System)',
        tags: ['legacy', 'migrated'],
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
        description: 'Automatically created publication range for data that existed before the archiving system was implemented.',
        isActive: false,
        isArchived: false
      });
      
      await defaultPublicationRange.save();
      console.log(`✅ Created default publication range: ${defaultPublicationRange._id}`);
    } else {
      console.log(`✅ Using existing default publication range: ${defaultPublicationRange._id}`);
    }

    // Update all vacancies without publicationRangeId
    if (vacanciesNeedingMigration > 0) {
      console.log(`\n🔄 Updating ${vacanciesNeedingMigration} vacancies...`);
      const vacancyResult = await Vacancy.updateMany(
        { publicationRangeId: { $exists: false } },
        { 
          $set: { 
            publicationRangeId: defaultPublicationRange._id,
            isArchived: false 
          } 
        }
      );
      console.log(`✅ Updated ${vacancyResult.modifiedCount} vacancies`);
    }

    // Update all candidates without publicationRangeId
    if (candidatesNeedingMigration > 0) {
      console.log(`\n🔄 Updating ${candidatesNeedingMigration} candidates...`);
      const candidateResult = await Candidate.updateMany(
        { publicationRangeId: { $exists: false } },
        { 
          $set: { 
            publicationRangeId: defaultPublicationRange._id,
            isArchived: false 
          } 
        }
      );
      console.log(`✅ Updated ${candidateResult.modifiedCount} candidates`);
    }

    // Verify migration
    const remainingVacancies = await Vacancy.countDocuments({ 
      publicationRangeId: { $exists: false } 
    });
    const remainingCandidates = await Candidate.countDocuments({ 
      publicationRangeId: { $exists: false } 
    });

    console.log(`\n📊 Migration Complete!`);
    console.log(`   Remaining vacancies without publication range: ${remainingVacancies}`);
    console.log(`   Remaining candidates without publication range: ${remainingCandidates}`);

    if (remainingVacancies === 0 && remainingCandidates === 0) {
      console.log('\n✅ All data successfully migrated!');
      return { success: true, migrated: true };
    } else {
      console.log('\n⚠️  Some data still needs migration. Please check manually.');
      return { success: false, migrated: true, incomplete: true };
    }

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    throw error;
  }
}
