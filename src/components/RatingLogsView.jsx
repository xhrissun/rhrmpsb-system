import React, { useState, useEffect } from 'react';
import { ratingLogsAPI } from '../utils/api';
import { useToast } from '../utils/ToastContext';

const RatingLogsView = () => {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    action: '',
    limit: 100,
    skip: 0
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [exporting, setExporting] = useState(false);
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [autoRefresh, setAutoRefresh] = useState(true); // NEW: Auto-refresh toggle
  const [lastRefresh, setLastRefresh] = useState(new Date()); // NEW: Last refresh timestamp

  const { showToast } = useToast();

  // NEW: Auto-refresh effect
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      loadLogs(true); // Silent refresh (no loading spinner)
      loadStats();
      setLastRefresh(new Date());
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [autoRefresh, filters]);

  useEffect(() => {
    loadLogs();
    loadStats();
  }, [filters]);

  const loadLogs = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const response = await ratingLogsAPI.getAll(filters);
      setLogs(response.logs);
      if (!silent) setLastRefresh(new Date());
    } catch (error) {
      console.error('Failed to load rating logs:', error);
      if (!silent) showToast('Failed to load rating logs', 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const statsData = await ratingLogsAPI.getStats();
      setStats(statsData);
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  const handleExportCSV = async () => {
    try {
      setExporting(true);
      await ratingLogsAPI.exportCSV();
      showToast('Rating audit log exported successfully!', 'success');
    } catch (error) {
      console.error('Failed to export logs:', error);
      showToast('Failed to export logs', 'error');
    } finally {
      setExporting(false);
    }
  };

  const toggleRowExpansion = (logId) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(logId)) {
        newSet.delete(logId);
      } else {
        newSet.add(logId);
      }
      return newSet;
    });
  };

  const getActionColor = (action) => {
    switch (action) {
      case 'created':
        return 'bg-green-100 text-green-800';
      case 'updated':
        return 'bg-blue-100 text-blue-800';
      case 'deleted':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getActionIcon = (action) => {
    switch (action) {
      case 'created':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        );
      case 'updated':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        );
      case 'deleted':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        );
      default:
        return null;
    }
  };

  const getActionLabel = (action) => {
    switch (action) {
      case 'created':
        return 'Created';
      case 'updated':
        return 'Updated';
      case 'deleted':
        return 'Deleted';
      default:
        return action;
    }
  };

  const groupLogsBySession = (logs) => {
    const grouped = [];
    const sessionMap = new Map();

    logs.forEach(log => {
      const sessionTime = Math.floor(new Date(log.createdAt).getTime() / (5 * 60 * 1000));
      const sessionKey = `${log.candidateId?._id}-${log.raterId?._id}-${log.itemNumber}-${sessionTime}`;

      if (sessionMap.has(sessionKey)) {
        sessionMap.get(sessionKey).details.push(log);
      } else {
        const session = {
          id: log._id,
          action: log.action,
          createdAt: log.createdAt,
          raterId: log.raterId,
          candidateId: log.candidateId,
          itemNumber: log.itemNumber,
          ipAddress: log.ipAddress,
          details: [log]
        };
        sessionMap.set(sessionKey, session);
        grouped.push(session);
      }
    });

    return grouped;
  };

  const filteredLogs = logs.filter(log => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      log.raterId?.name?.toLowerCase().includes(search) ||
      log.candidateId?.fullName?.toLowerCase().includes(search) ||
      log.itemNumber?.toLowerCase().includes(search) ||
      log.competencyId?.name?.toLowerCase().includes(search)
    );
  });

  const groupedLogs = groupLogsBySession(filteredLogs);

  const formatTimeSince = (date) => {
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  if (loading && logs.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Rating Audit Log</h2>
          <p className="text-sm text-gray-600 mt-1">Track changes to ratings - only actual updates are logged</p>
        </div>
        <div className="flex items-center space-x-3">
          {/* NEW: Auto-refresh toggle */}
          <div className="flex items-center space-x-2 px-3 py-2 bg-white border border-gray-300 rounded-lg">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              <span className="ml-3 text-sm font-medium text-gray-700">
                Auto-refresh {autoRefresh && `(${formatTimeSince(lastRefresh)})`}
              </span>
            </label>
          </div>
          
          {/* Manual refresh button */}
          <button
            onClick={() => {
              loadLogs();
              loadStats();
            }}
            className="px-4 py-2 rounded-lg font-medium flex items-center space-x-2 bg-white border border-gray-300 hover:bg-gray-50"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>Refresh</span>
          </button>

          <button
            onClick={handleExportCSV}
            disabled={exporting}
            className={`px-4 py-2 rounded-lg font-medium flex items-center space-x-2 ${
              exporting
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {exporting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Exporting...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Export CSV</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {stats.actionStats.map(stat => (
            <div key={stat._id} className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 capitalize">{getActionLabel(stat._id)}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{stat.count}</p>
                </div>
                <div className={`p-3 rounded-full ${getActionColor(stat._id)}`}>
                  {getActionIcon(stat._id)}
                </div>
              </div>
            </div>
          ))}
          <div className="bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg p-4 shadow-sm text-white">
            <p className="text-sm font-medium opacity-90">Total Changes</p>
            <p className="text-2xl font-bold mt-1">
              {stats.actionStats.reduce((sum, stat) => sum + stat.count, 0)}
            </p>
          </div>
        </div>
      )}

      {/* Rater Activity Summary */}
      {stats && stats.raterActivity.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Rater Activity Summary</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rater</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Updated</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Deleted</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {stats.raterActivity.map(activity => (
                  <tr key={activity.raterId}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {activity.raterName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {activity.raterType}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                        {activity.created}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                        {activity.updated}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                        {activity.deleted}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="px-3 py-1 text-sm font-bold rounded-full bg-gray-100 text-gray-800">
                        {activity.totalActions}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Filters and Search */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by rater, candidate, item number..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Action</label>
            <select
              value={filters.action}
              onChange={(e) => setFilters({ ...filters, action: e.target.value, skip: 0 })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Actions</option>
              <option value="created">Created</option>
              <option value="updated">Updated</option>
              <option value="deleted">Deleted</option>
            </select>
          </div>
        </div>
      </div>

      {/* Logs Table - Grouped Sessions showing ONLY changed competencies */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12"></th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date & Time</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rater</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Candidate</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item Number</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Changes</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {groupedLogs.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-6 py-12 text-center text-gray-500">
                    <div className="flex flex-col items-center space-y-2">
                      <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p className="text-lg font-medium">No changes found</p>
                      <p className="text-sm">Try adjusting your search or filter criteria</p>
                    </div>
                  </td>
                </tr>
              ) : (
                groupedLogs.map(session => {
                  const isExpanded = expandedRows.has(session.id);
                  // Show the most common action in the session
                  const actionCounts = session.details.reduce((acc, log) => {
                    acc[log.action] = (acc[log.action] || 0) + 1;
                    return acc;
                  }, {});
                  const primaryAction = Object.keys(actionCounts).reduce((a, b) => 
                    actionCounts[a] > actionCounts[b] ? a : b
                  );
                  
                  return (
                    <React.Fragment key={session.id}>
                      <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => toggleRowExpansion(session.id)}>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <button className="text-gray-400 hover:text-gray-600 focus:outline-none">
                            {isExpanded ? (
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            ) : (
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            )}
                          </button>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {new Date(session.createdAt).toLocaleString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getActionColor(primaryAction)}`}>
                            {getActionIcon(primaryAction)}
                            <span className="ml-1 capitalize">{getActionLabel(primaryAction)}</span>
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <div className="text-gray-900 font-medium">{session.raterId?.name || 'N/A'}</div>
                          <div className="text-gray-500 text-xs">{session.raterId?.raterType || 'N/A'}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {session.candidateId?.fullName || 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {session.itemNumber || 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-blue-100 text-blue-800">
                            {session.details.length} {session.details.length === 1 ? 'change' : 'changes'}
                          </span>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan="7" className="px-6 py-4 bg-gray-50">
                            <div className="space-y-2">
                              <div className="flex items-center justify-between mb-3">
                                <h4 className="text-sm font-semibold text-gray-700">Rating Changes</h4>
                                <span className="text-xs text-gray-500">IP: {session.ipAddress || 'N/A'}</span>
                              </div>
                              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                                <table className="min-w-full divide-y divide-gray-200">
                                  <thead className="bg-gray-100">
                                    <tr>
                                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-600">Competency</th>
                                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-600">Type</th>
                                      <th className="px-4 py-2 text-center text-xs font-medium text-gray-600">Action</th>
                                      <th className="px-4 py-2 text-center text-xs font-medium text-gray-600">Score Change</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-200">
                                    {session.details.map((detail, idx) => (
                                      <tr key={idx} className="hover:bg-gray-50">
                                        <td className="px-4 py-2 text-sm text-gray-900">
                                          {detail.competencyId?.name || 'N/A'}
                                        </td>
                                        <td className="px-4 py-2 text-sm">
                                          <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-700 capitalize">
                                            {detail.competencyType || 'N/A'}
                                          </span>
                                        </td>
                                        <td className="px-4 py-2 text-center">
                                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getActionColor(detail.action)}`}>
                                            {getActionIcon(detail.action)}
                                            <span className="ml-1 capitalize">{getActionLabel(detail.action)}</span>
                                          </span>
                                        </td>
                                        <td className="px-4 py-2 text-center text-sm">
                                          {detail.action === 'created' && (
                                            <span className="text-green-600 font-semibold">New: {detail.newScore}</span>
                                          )}
                                          {detail.action === 'updated' && (
                                            <span className="text-blue-600 font-semibold">
                                              {detail.oldScore} → {detail.newScore}
                                            </span>
                                          )}
                                          {detail.action === 'deleted' && (
                                            <span className="text-red-600 font-semibold">Removed: {detail.oldScore}</span>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {filteredLogs.length === filters.limit && (
        <div className="flex justify-center space-x-4">
          <button
            onClick={() => setFilters({ ...filters, skip: Math.max(0, filters.skip - filters.limit) })}
            disabled={filters.skip === 0}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <button
            onClick={() => setFilters({ ...filters, skip: filters.skip + filters.limit })}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};

export default RatingLogsView;
