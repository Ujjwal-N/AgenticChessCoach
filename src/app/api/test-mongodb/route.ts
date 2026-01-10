import { NextResponse } from 'next/server';
import { getDatabase, getGameAnalysisCollection } from '@/lib/mongodb';

export async function GET() {
  try {
    // Test database connection
    const db = await getDatabase();
    await db.admin().ping();
    
    // Test collection access
    const collection = await getGameAnalysisCollection();
    const count = await collection.countDocuments();
    
    // Insert a test document
    const testDoc = {
      test: true,
      message: 'MongoDB connection test',
      timestamp: new Date(),
    };
    const insertResult = await collection.insertOne(testDoc);
    
    // Clean up test document
    await collection.deleteOne({ _id: insertResult.insertedId });
    
    return NextResponse.json({
      success: true,
      message: 'MongoDB connection successful!',
      database: db.databaseName,
      collection: 'game_analysis',
      documentCount: count,
    });
  } catch (error) {
    console.error('MongoDB connection error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

