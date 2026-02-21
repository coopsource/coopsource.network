export const lexicons = [
  {
    "lexicon": 1,
    "id": "network.coopsource.agreement.amendment",
    "defs": {
      "main": {
        "type": "record",
        "description": "A proposed amendment to a master agreement, linked to a governance proposal for voting.",
        "key": "tid",
        "record": {
          "type": "object",
          "required": [
            "agreementUri",
            "title",
            "description",
            "changes",
            "status",
            "fromVersion",
            "proposedAt"
          ],
          "properties": {
            "agreementUri": {
              "type": "string",
              "format": "at-uri",
              "description": "The master agreement being amended."
            },
            "proposalUri": {
              "type": "string",
              "format": "at-uri",
              "description": "The governance proposal for voting on this amendment."
            },
            "title": {
              "type": "string",
              "maxLength": 255
            },
            "description": {
              "type": "string",
              "maxLength": 10000
            },
            "changes": {
              "type": "ref",
              "ref": "#amendmentChanges"
            },
            "status": {
              "type": "string",
              "knownValues": [
                "proposed",
                "voting",
                "approved",
                "applied",
                "rejected"
              ]
            },
            "fromVersion": {
              "type": "integer",
              "minimum": 1
            },
            "toVersion": {
              "type": "integer",
              "minimum": 2
            },
            "proposedAt": {
              "type": "string",
              "format": "datetime"
            },
            "appliedAt": {
              "type": "string",
              "format": "datetime"
            }
          }
        }
      },
      "amendmentChanges": {
        "type": "object",
        "description": "Field-level changes to the agreement. Each key maps to an object with 'from' and 'to' values.",
        "properties": {
          "title": {
            "type": "ref",
            "ref": "#fieldChange"
          },
          "purpose": {
            "type": "ref",
            "ref": "#fieldChange"
          },
          "scope": {
            "type": "ref",
            "ref": "#fieldChange"
          },
          "governanceFramework": {
            "type": "ref",
            "ref": "#fieldChange"
          },
          "disputeResolution": {
            "type": "ref",
            "ref": "#fieldChange"
          },
          "amendmentProcess": {
            "type": "ref",
            "ref": "#fieldChange"
          },
          "terminationConditions": {
            "type": "ref",
            "ref": "#fieldChange"
          }
        }
      },
      "fieldChange": {
        "type": "object",
        "required": [
          "from",
          "to"
        ],
        "properties": {
          "from": {
            "type": "unknown"
          },
          "to": {
            "type": "unknown"
          }
        }
      }
    }
  },
  {
    "lexicon": 1,
    "id": "network.coopsource.agreement.contribution",
    "defs": {
      "main": {
        "type": "record",
        "description": "A tracked contribution by a stakeholder toward their agreement terms.",
        "key": "tid",
        "record": {
          "type": "object",
          "required": [
            "stakeholderTermsUri",
            "contributionType",
            "description",
            "status",
            "createdAt"
          ],
          "properties": {
            "stakeholderTermsUri": {
              "type": "string",
              "format": "at-uri",
              "description": "The stakeholder terms record this contribution fulfills."
            },
            "contributionType": {
              "type": "string",
              "knownValues": [
                "labor",
                "capital",
                "resources",
                "intellectual-property",
                "network"
              ]
            },
            "description": {
              "type": "string",
              "maxLength": 3000
            },
            "amount": {
              "type": "string",
              "maxLength": 500
            },
            "units": {
              "type": "string",
              "maxLength": 100,
              "description": "Hours, dollars, items, etc."
            },
            "startDate": {
              "type": "string",
              "format": "datetime"
            },
            "endDate": {
              "type": "string",
              "format": "datetime"
            },
            "status": {
              "type": "string",
              "knownValues": [
                "pending",
                "in-progress",
                "fulfilled",
                "disputed"
              ]
            },
            "createdAt": {
              "type": "string",
              "format": "datetime"
            }
          }
        }
      }
    }
  },
  {
    "lexicon": 1,
    "id": "network.coopsource.agreement.master",
    "defs": {
      "main": {
        "type": "record",
        "description": "A master agreement governing a project, defining governance framework and terms.",
        "key": "tid",
        "record": {
          "type": "object",
          "required": [
            "projectUri",
            "title",
            "version",
            "status",
            "createdAt"
          ],
          "properties": {
            "projectUri": {
              "type": "string",
              "format": "at-uri",
              "description": "The project this agreement governs."
            },
            "title": {
              "type": "string",
              "maxLength": 255
            },
            "version": {
              "type": "integer",
              "minimum": 1
            },
            "purpose": {
              "type": "string",
              "maxLength": 3000
            },
            "scope": {
              "type": "string",
              "maxLength": 3000
            },
            "agreementType": {
              "type": "string",
              "description": "Template type used.",
              "knownValues": [
                "worker-cooperative",
                "multi-stakeholder",
                "platform-cooperative",
                "open-source",
                "producer-cooperative",
                "hybrid-member-investor",
                "custom"
              ]
            },
            "effectiveDate": {
              "type": "string",
              "format": "datetime"
            },
            "terminationDate": {
              "type": "string",
              "format": "datetime"
            },
            "governanceFramework": {
              "type": "ref",
              "ref": "#governanceFramework"
            },
            "terminationConditions": {
              "type": "array",
              "items": {
                "type": "string",
                "maxLength": 2000
              }
            },
            "status": {
              "type": "string",
              "knownValues": [
                "draft",
                "active",
                "amended",
                "terminated"
              ]
            },
            "createdAt": {
              "type": "string",
              "format": "datetime"
            },
            "updatedAt": {
              "type": "string",
              "format": "datetime"
            }
          }
        }
      },
      "governanceFramework": {
        "type": "object",
        "properties": {
          "decisionMethod": {
            "type": "string",
            "knownValues": [
              "consensus",
              "majority-vote",
              "supermajority",
              "weighted-vote"
            ]
          },
          "quorum": {
            "type": "integer",
            "minimum": 0,
            "maximum": 100,
            "description": "Quorum percentage required."
          },
          "votingThreshold": {
            "type": "integer",
            "minimum": 0,
            "maximum": 100,
            "description": "Voting threshold percentage."
          },
          "disputeResolution": {
            "type": "string",
            "maxLength": 3000
          },
          "modificationProcess": {
            "type": "string",
            "maxLength": 3000
          }
        }
      }
    }
  },
  {
    "lexicon": 1,
    "id": "network.coopsource.agreement.signature",
    "defs": {
      "main": {
        "type": "record",
        "description": "A digital signature on an agreement or stakeholder terms.",
        "key": "tid",
        "record": {
          "type": "object",
          "required": [
            "agreementUri",
            "signerDid",
            "signatureType",
            "signedAt"
          ],
          "properties": {
            "agreementUri": {
              "type": "string",
              "format": "at-uri",
              "description": "The agreement or terms being signed."
            },
            "signerDid": {
              "type": "string",
              "format": "did"
            },
            "signerRole": {
              "type": "string",
              "maxLength": 255
            },
            "signatureType": {
              "type": "string",
              "knownValues": [
                "digital",
                "witnessed",
                "notarized"
              ]
            },
            "signatureData": {
              "type": "ref",
              "ref": "#signatureData"
            },
            "signedAt": {
              "type": "string",
              "format": "datetime"
            }
          }
        }
      },
      "signatureData": {
        "type": "object",
        "required": [
          "method",
          "timestamp"
        ],
        "properties": {
          "method": {
            "type": "string",
            "knownValues": [
              "atproto-did-proof",
              "timestamp",
              "cryptographic-hash"
            ]
          },
          "proof": {
            "type": "string",
            "maxLength": 10000
          },
          "timestamp": {
            "type": "string",
            "format": "datetime"
          },
          "witnessDids": {
            "type": "array",
            "items": {
              "type": "string",
              "format": "did"
            }
          }
        }
      }
    }
  },
  {
    "lexicon": 1,
    "id": "network.coopsource.agreement.stakeholderTerms",
    "defs": {
      "main": {
        "type": "record",
        "description": "Terms specific to one stakeholder party within a master agreement.",
        "key": "tid",
        "record": {
          "type": "object",
          "required": [
            "masterAgreementUri",
            "stakeholderDid",
            "stakeholderType",
            "createdAt"
          ],
          "properties": {
            "masterAgreementUri": {
              "type": "string",
              "format": "at-uri",
              "description": "The master agreement these terms belong to."
            },
            "stakeholderDid": {
              "type": "string",
              "format": "did"
            },
            "stakeholderType": {
              "type": "string",
              "knownValues": [
                "worker",
                "investor",
                "customer",
                "supplier",
                "community",
                "partner"
              ]
            },
            "contributions": {
              "type": "array",
              "items": {
                "type": "ref",
                "ref": "#termsContribution"
              }
            },
            "financialTerms": {
              "type": "ref",
              "ref": "#financialTerms"
            },
            "ipTerms": {
              "type": "ref",
              "ref": "#ipTerms"
            },
            "governanceRights": {
              "type": "ref",
              "ref": "#governanceRights"
            },
            "exitTerms": {
              "type": "ref",
              "ref": "#exitTerms"
            },
            "createdAt": {
              "type": "string",
              "format": "datetime"
            }
          }
        }
      },
      "termsContribution": {
        "type": "object",
        "required": [
          "type",
          "description"
        ],
        "properties": {
          "type": {
            "type": "string",
            "knownValues": [
              "labor",
              "capital",
              "resources",
              "intellectual-property",
              "network"
            ]
          },
          "description": {
            "type": "string",
            "maxLength": 2000
          },
          "amount": {
            "type": "string",
            "maxLength": 500
          }
        }
      },
      "financialTerms": {
        "type": "object",
        "properties": {
          "compensationType": {
            "type": "string",
            "knownValues": [
              "salary",
              "share",
              "dividend",
              "hourly",
              "other"
            ]
          },
          "compensationAmount": {
            "type": "integer",
            "description": "Amount in smallest currency unit (e.g. cents)."
          },
          "currency": {
            "type": "string",
            "maxLength": 10
          },
          "paymentSchedule": {
            "type": "string",
            "maxLength": 500
          },
          "profitShare": {
            "type": "integer",
            "minimum": 0,
            "maximum": 100,
            "description": "Percentage."
          },
          "equityStake": {
            "type": "integer",
            "minimum": 0,
            "maximum": 100,
            "description": "Percentage."
          }
        }
      },
      "ipTerms": {
        "type": "object",
        "properties": {
          "ownership": {
            "type": "string",
            "knownValues": [
              "individual",
              "collective",
              "shared"
            ]
          },
          "licensing": {
            "type": "string",
            "maxLength": 2000
          }
        }
      },
      "governanceRights": {
        "type": "object",
        "properties": {
          "votingPower": {
            "type": "integer",
            "minimum": 0,
            "maximum": 100,
            "description": "Voting power percentage."
          },
          "boardSeat": {
            "type": "boolean"
          },
          "decisionCategories": {
            "type": "array",
            "items": {
              "type": "string",
              "maxLength": 500
            }
          }
        }
      },
      "exitTerms": {
        "type": "object",
        "properties": {
          "buybackPrice": {
            "type": "string",
            "maxLength": 500
          },
          "noticePeriodDays": {
            "type": "integer",
            "minimum": 0
          },
          "conditions": {
            "type": "string",
            "maxLength": 3000
          }
        }
      }
    }
  },
  {
    "lexicon": 1,
    "id": "network.coopsource.alignment.interest",
    "defs": {
      "main": {
        "type": "record",
        "description": "A stakeholder's detailed interests, contributions, constraints, and red lines for a project.",
        "key": "tid",
        "record": {
          "type": "object",
          "required": [
            "projectUri",
            "interests",
            "createdAt"
          ],
          "properties": {
            "projectUri": {
              "type": "string",
              "format": "at-uri",
              "description": "The project this interest declaration relates to."
            },
            "interests": {
              "type": "array",
              "description": "Detailed interests and goals.",
              "items": {
                "type": "ref",
                "ref": "#interestItem"
              }
            },
            "contributions": {
              "type": "array",
              "description": "What the stakeholder can bring to the project.",
              "items": {
                "type": "ref",
                "ref": "#contributionItem"
              }
            },
            "constraints": {
              "type": "array",
              "description": "Limitations or conditions.",
              "items": {
                "type": "ref",
                "ref": "#constraintItem"
              }
            },
            "redLines": {
              "type": "array",
              "description": "Non-negotiable boundaries.",
              "items": {
                "type": "ref",
                "ref": "#redLineItem"
              }
            },
            "preferences": {
              "type": "ref",
              "ref": "#workPreferences",
              "description": "Work style and decision-making preferences."
            },
            "createdAt": {
              "type": "string",
              "format": "datetime"
            },
            "updatedAt": {
              "type": "string",
              "format": "datetime"
            }
          }
        }
      },
      "interestItem": {
        "type": "object",
        "required": [
          "category",
          "description",
          "priority"
        ],
        "properties": {
          "category": {
            "type": "string",
            "maxLength": 100
          },
          "description": {
            "type": "string",
            "maxLength": 2000
          },
          "priority": {
            "type": "integer",
            "minimum": 1,
            "maximum": 5
          },
          "scope": {
            "type": "string",
            "knownValues": [
              "short-term",
              "medium-term",
              "long-term"
            ]
          }
        }
      },
      "contributionItem": {
        "type": "object",
        "required": [
          "type",
          "description"
        ],
        "properties": {
          "type": {
            "type": "string",
            "knownValues": [
              "skill",
              "resource",
              "capital",
              "network",
              "time"
            ]
          },
          "description": {
            "type": "string",
            "maxLength": 2000
          },
          "capacity": {
            "type": "string",
            "maxLength": 500,
            "description": "Estimated availability."
          }
        }
      },
      "constraintItem": {
        "type": "object",
        "required": [
          "description"
        ],
        "properties": {
          "description": {
            "type": "string",
            "maxLength": 2000
          },
          "hardConstraint": {
            "type": "boolean"
          }
        }
      },
      "redLineItem": {
        "type": "object",
        "required": [
          "description"
        ],
        "properties": {
          "description": {
            "type": "string",
            "maxLength": 2000
          },
          "reason": {
            "type": "string",
            "maxLength": 2000
          }
        }
      },
      "workPreferences": {
        "type": "object",
        "properties": {
          "decisionMaking": {
            "type": "string",
            "maxLength": 500
          },
          "communication": {
            "type": "string",
            "maxLength": 500
          },
          "pace": {
            "type": "string",
            "maxLength": 500
          }
        }
      }
    }
  },
  {
    "lexicon": 1,
    "id": "network.coopsource.alignment.interestMap",
    "defs": {
      "main": {
        "type": "record",
        "description": "A computed map of alignment and conflict zones across stakeholder interests for a project.",
        "key": "tid",
        "record": {
          "type": "object",
          "required": [
            "projectUri",
            "createdAt"
          ],
          "properties": {
            "projectUri": {
              "type": "string",
              "format": "at-uri",
              "description": "The project this map covers."
            },
            "alignmentZones": {
              "type": "array",
              "description": "Areas where stakeholders agree.",
              "items": {
                "type": "ref",
                "ref": "#alignmentZone"
              }
            },
            "conflictZones": {
              "type": "array",
              "description": "Areas of tension between stakeholders.",
              "items": {
                "type": "ref",
                "ref": "#conflictZone"
              }
            },
            "aiAnalysis": {
              "type": "ref",
              "ref": "#aiAnalysis",
              "description": "Optional AI-generated analysis."
            },
            "createdAt": {
              "type": "string",
              "format": "datetime"
            }
          }
        }
      },
      "alignmentZone": {
        "type": "object",
        "required": [
          "participants",
          "description",
          "strength"
        ],
        "properties": {
          "participants": {
            "type": "array",
            "items": {
              "type": "string",
              "format": "did"
            }
          },
          "description": {
            "type": "string",
            "maxLength": 2000
          },
          "strength": {
            "type": "integer",
            "minimum": 0,
            "maximum": 100,
            "description": "Overlap percentage."
          },
          "interestsInvolved": {
            "type": "array",
            "items": {
              "type": "string",
              "maxLength": 500
            }
          }
        }
      },
      "conflictZone": {
        "type": "object",
        "required": [
          "stakeholders",
          "description",
          "severity"
        ],
        "properties": {
          "stakeholders": {
            "type": "array",
            "items": {
              "type": "string",
              "format": "did"
            }
          },
          "description": {
            "type": "string",
            "maxLength": 2000
          },
          "severity": {
            "type": "string",
            "knownValues": [
              "low",
              "medium",
              "high"
            ]
          },
          "potentialSolutions": {
            "type": "array",
            "items": {
              "type": "string",
              "maxLength": 1000
            }
          }
        }
      },
      "aiAnalysis": {
        "type": "object",
        "properties": {
          "summary": {
            "type": "string",
            "maxLength": 5000
          },
          "recommendations": {
            "type": "array",
            "items": {
              "type": "string",
              "maxLength": 2000
            }
          },
          "mediationSuggestions": {
            "type": "array",
            "items": {
              "type": "string",
              "maxLength": 2000
            }
          }
        }
      }
    }
  },
  {
    "lexicon": 1,
    "id": "network.coopsource.alignment.outcome",
    "defs": {
      "main": {
        "type": "record",
        "description": "A desired outcome for a project, with success criteria and stakeholder support tracking.",
        "key": "tid",
        "record": {
          "type": "object",
          "required": [
            "projectUri",
            "title",
            "description",
            "category",
            "status",
            "createdAt"
          ],
          "properties": {
            "projectUri": {
              "type": "string",
              "format": "at-uri",
              "description": "The project this outcome belongs to."
            },
            "title": {
              "type": "string",
              "maxLength": 255
            },
            "description": {
              "type": "string",
              "maxLength": 3000
            },
            "category": {
              "type": "string",
              "knownValues": [
                "financial",
                "social",
                "environmental",
                "governance",
                "other"
              ]
            },
            "successCriteria": {
              "type": "array",
              "items": {
                "type": "ref",
                "ref": "#successCriterion"
              }
            },
            "stakeholderSupport": {
              "type": "array",
              "items": {
                "type": "ref",
                "ref": "#supportEntry"
              }
            },
            "status": {
              "type": "string",
              "knownValues": [
                "proposed",
                "endorsed",
                "active",
                "achieved",
                "abandoned"
              ]
            },
            "createdAt": {
              "type": "string",
              "format": "datetime"
            }
          }
        }
      },
      "successCriterion": {
        "type": "object",
        "required": [
          "metric",
          "target"
        ],
        "properties": {
          "metric": {
            "type": "string",
            "maxLength": 500
          },
          "target": {
            "type": "string",
            "maxLength": 500
          },
          "timeline": {
            "type": "string",
            "maxLength": 200
          },
          "ownerDid": {
            "type": "string",
            "format": "did"
          }
        }
      },
      "supportEntry": {
        "type": "object",
        "required": [
          "stakeholderDid",
          "supportLevel"
        ],
        "properties": {
          "stakeholderDid": {
            "type": "string",
            "format": "did"
          },
          "supportLevel": {
            "type": "string",
            "knownValues": [
              "strong",
              "moderate",
              "conditional",
              "neutral",
              "opposed"
            ]
          },
          "conditions": {
            "type": "string",
            "maxLength": 2000
          }
        }
      }
    }
  },
  {
    "lexicon": 1,
    "id": "network.coopsource.alignment.stakeholder",
    "defs": {
      "main": {
        "type": "record",
        "description": "A stakeholder profile within a project, describing their role and background.",
        "key": "tid",
        "record": {
          "type": "object",
          "required": [
            "projectUri",
            "name",
            "role",
            "createdAt"
          ],
          "properties": {
            "projectUri": {
              "type": "string",
              "format": "at-uri",
              "description": "The project this stakeholder belongs to."
            },
            "name": {
              "type": "string",
              "maxLength": 255,
              "description": "Display name of the stakeholder."
            },
            "role": {
              "type": "string",
              "maxLength": 100,
              "description": "Stakeholder category.",
              "knownValues": [
                "worker",
                "investor",
                "customer",
                "partner",
                "supplier",
                "community",
                "other"
              ]
            },
            "stakeholderClass": {
              "type": "string",
              "maxLength": 100,
              "description": "Subclass for more specific categorization."
            },
            "description": {
              "type": "string",
              "maxLength": 3000,
              "description": "Background and context about this stakeholder."
            },
            "interestsSummary": {
              "type": "string",
              "maxLength": 1000,
              "description": "Brief overview of what they care about."
            },
            "createdAt": {
              "type": "string",
              "format": "datetime"
            }
          }
        }
      }
    }
  },
  {
    "lexicon": 1,
    "id": "network.coopsource.connection.binding",
    "defs": {
      "main": {
        "type": "record",
        "description": "A binding between an external resource and a project.",
        "key": "tid",
        "record": {
          "type": "object",
          "required": [
            "connectionUri",
            "projectUri",
            "resourceType",
            "resourceId",
            "createdAt"
          ],
          "properties": {
            "connectionUri": {
              "type": "string",
              "format": "at-uri",
              "description": "The external connection this binding belongs to."
            },
            "projectUri": {
              "type": "string",
              "format": "at-uri",
              "description": "The project this resource is bound to."
            },
            "resourceType": {
              "type": "string",
              "description": "The type of external resource.",
              "knownValues": [
                "github_repo",
                "google_doc",
                "google_sheet",
                "google_drive_folder"
              ]
            },
            "resourceId": {
              "type": "string",
              "maxLength": 1000,
              "description": "The external identifier for the resource."
            },
            "metadata": {
              "type": "ref",
              "ref": "#resourceMetadata"
            },
            "createdAt": {
              "type": "string",
              "format": "datetime"
            }
          }
        }
      },
      "resourceMetadata": {
        "type": "object",
        "description": "Display metadata for the bound resource.",
        "properties": {
          "displayName": {
            "type": "string",
            "maxLength": 500
          },
          "url": {
            "type": "string",
            "maxLength": 2000
          },
          "description": {
            "type": "string",
            "maxLength": 2000
          }
        }
      }
    }
  },
  {
    "lexicon": 1,
    "id": "network.coopsource.connection.link",
    "defs": {
      "main": {
        "type": "record",
        "description": "An external service connection (e.g., GitHub, Google) linked to a user's account.",
        "key": "tid",
        "record": {
          "type": "object",
          "required": [
            "service",
            "status",
            "createdAt"
          ],
          "properties": {
            "service": {
              "type": "string",
              "description": "The external service provider.",
              "knownValues": [
                "github",
                "google"
              ]
            },
            "status": {
              "type": "string",
              "description": "Current status of the connection.",
              "knownValues": [
                "active",
                "revoked",
                "expired"
              ]
            },
            "metadata": {
              "type": "ref",
              "ref": "#metadata"
            },
            "createdAt": {
              "type": "string",
              "format": "datetime"
            }
          }
        }
      },
      "metadata": {
        "type": "object",
        "description": "Metadata about the external service account.",
        "properties": {
          "username": {
            "type": "string",
            "maxLength": 255
          },
          "email": {
            "type": "string",
            "maxLength": 255
          },
          "scopes": {
            "type": "array",
            "items": {
              "type": "string",
              "maxLength": 255
            }
          }
        }
      }
    }
  },
  {
    "lexicon": 1,
    "id": "network.coopsource.connection.sync",
    "defs": {
      "main": {
        "type": "record",
        "description": "A synchronization event for a connection binding (placeholder for Phase 3).",
        "key": "tid",
        "record": {
          "type": "object",
          "required": [
            "bindingUri",
            "eventType",
            "timestamp"
          ],
          "properties": {
            "bindingUri": {
              "type": "string",
              "format": "at-uri",
              "description": "The connection binding this sync event relates to."
            },
            "eventType": {
              "type": "string",
              "description": "The type of sync event.",
              "knownValues": [
                "push",
                "pull",
                "webhook"
              ]
            },
            "timestamp": {
              "type": "string",
              "format": "datetime"
            },
            "payload": {
              "type": "object",
              "description": "Event-specific data."
            }
          }
        }
      }
    }
  },
  {
    "lexicon": 1,
    "id": "network.coopsource.funding.campaign",
    "defs": {
      "main": {
        "type": "record",
        "description": "A crowdfunding campaign for a cooperative, project, or the network.",
        "key": "tid",
        "record": {
          "type": "object",
          "required": [
            "beneficiaryUri",
            "title",
            "tier",
            "campaignType",
            "goalAmount",
            "goalCurrency",
            "fundingModel",
            "status",
            "createdAt"
          ],
          "properties": {
            "beneficiaryUri": {
              "type": "string",
              "description": "AT URI of the cooperative/project, or 'network:coopsource' for network-level campaigns."
            },
            "title": {
              "type": "string",
              "maxLength": 256
            },
            "description": {
              "type": "string",
              "maxLength": 5000
            },
            "tier": {
              "type": "string",
              "description": "The level at which this campaign operates.",
              "knownValues": [
                "network",
                "cooperative",
                "project"
              ]
            },
            "campaignType": {
              "type": "string",
              "description": "The type of crowdfunding campaign.",
              "knownValues": [
                "rewards",
                "patronage",
                "donation",
                "revenue_share"
              ]
            },
            "goalAmount": {
              "type": "integer",
              "minimum": 1,
              "description": "Funding goal in cents."
            },
            "goalCurrency": {
              "type": "string",
              "maxLength": 10,
              "description": "ISO 4217 currency code."
            },
            "amountRaised": {
              "type": "integer",
              "minimum": 0,
              "description": "Total amount raised in cents."
            },
            "backerCount": {
              "type": "integer",
              "minimum": 0,
              "description": "Number of backers."
            },
            "fundingModel": {
              "type": "string",
              "description": "How funds are collected.",
              "knownValues": [
                "all_or_nothing",
                "keep_it_all"
              ]
            },
            "status": {
              "type": "string",
              "knownValues": [
                "draft",
                "active",
                "funded",
                "completed",
                "cancelled"
              ]
            },
            "startDate": {
              "type": "string",
              "format": "datetime"
            },
            "endDate": {
              "type": "string",
              "format": "datetime"
            },
            "metadata": {
              "type": "unknown",
              "description": "Additional campaign data (reward tiers, images, tags)."
            },
            "createdAt": {
              "type": "string",
              "format": "datetime"
            }
          }
        }
      }
    }
  },
  {
    "lexicon": 1,
    "id": "network.coopsource.funding.pledge",
    "defs": {
      "main": {
        "type": "record",
        "description": "A pledge or contribution to a crowdfunding campaign.",
        "key": "tid",
        "record": {
          "type": "object",
          "required": [
            "campaignUri",
            "backerDid",
            "amount",
            "currency",
            "paymentStatus",
            "createdAt"
          ],
          "properties": {
            "campaignUri": {
              "type": "string",
              "format": "at-uri",
              "description": "The campaign this pledge is for."
            },
            "backerDid": {
              "type": "string",
              "format": "did",
              "description": "DID of the backer."
            },
            "amount": {
              "type": "integer",
              "minimum": 1,
              "description": "Pledge amount in cents."
            },
            "currency": {
              "type": "string",
              "maxLength": 10,
              "description": "ISO 4217 currency code."
            },
            "paymentStatus": {
              "type": "string",
              "knownValues": [
                "pending",
                "completed",
                "failed",
                "refunded"
              ]
            },
            "metadata": {
              "type": "unknown",
              "description": "Additional pledge data (reward tier selection, etc.)."
            },
            "createdAt": {
              "type": "string",
              "format": "datetime"
            }
          }
        }
      }
    }
  },
  {
    "lexicon": 1,
    "id": "network.coopsource.governance.delegation",
    "defs": {
      "main": {
        "type": "record",
        "description": "A vote delegation from one project member to another.",
        "key": "tid",
        "record": {
          "type": "object",
          "required": [
            "projectUri",
            "delegatorDid",
            "delegateeDid",
            "scope",
            "status",
            "createdAt"
          ],
          "properties": {
            "projectUri": {
              "type": "string",
              "format": "at-uri",
              "description": "The project this delegation applies to."
            },
            "delegatorDid": {
              "type": "string",
              "format": "did",
              "description": "The DID of the person delegating their vote."
            },
            "delegateeDid": {
              "type": "string",
              "format": "did",
              "description": "The DID of the person receiving the delegation."
            },
            "scope": {
              "type": "string",
              "description": "Whether delegation covers all project proposals or a specific one.",
              "knownValues": [
                "project",
                "proposal"
              ]
            },
            "proposalUri": {
              "type": "string",
              "format": "at-uri",
              "description": "Specific proposal URI when scope is 'proposal'."
            },
            "status": {
              "type": "string",
              "knownValues": [
                "active",
                "revoked"
              ]
            },
            "revokedAt": {
              "type": "string",
              "format": "datetime",
              "description": "When the delegation was revoked."
            },
            "createdAt": {
              "type": "string",
              "format": "datetime"
            }
          }
        }
      }
    }
  },
  {
    "lexicon": 1,
    "id": "network.coopsource.governance.proposal",
    "defs": {
      "main": {
        "type": "record",
        "description": "A governance proposal for cooperative decision-making.",
        "key": "tid",
        "record": {
          "type": "object",
          "required": [
            "cooperativeDid",
            "title",
            "body",
            "proposalType",
            "votingMethod",
            "status",
            "createdAt"
          ],
          "properties": {
            "cooperativeDid": {
              "type": "string",
              "format": "did",
              "description": "The cooperative this proposal belongs to."
            },
            "title": {
              "type": "string",
              "maxLength": 256
            },
            "body": {
              "type": "string",
              "maxLength": 10000,
              "description": "The full text of the proposal."
            },
            "proposalType": {
              "type": "string",
              "description": "The category of the proposal.",
              "knownValues": [
                "amendment",
                "budget",
                "membership",
                "policy",
                "election",
                "other"
              ]
            },
            "votingMethod": {
              "type": "string",
              "description": "How votes are counted.",
              "knownValues": [
                "simple_majority",
                "supermajority",
                "consensus",
                "ranked_choice"
              ]
            },
            "options": {
              "type": "array",
              "description": "For ranked_choice or multi-option proposals, the list of options.",
              "items": {
                "type": "string",
                "maxLength": 256
              }
            },
            "quorumRequired": {
              "type": "number",
              "minimum": 0,
              "maximum": 1,
              "description": "Fraction of members required to vote (0-1)."
            },
            "quorumBasis": {
              "type": "string",
              "description": "Whether quorum is based on votes cast or total members.",
              "knownValues": [
                "votesCast",
                "totalMembers"
              ]
            },
            "discussionEndsAt": {
              "type": "string",
              "format": "datetime",
              "description": "When the discussion period closes."
            },
            "votingEndsAt": {
              "type": "string",
              "format": "datetime",
              "description": "When the voting period closes."
            },
            "status": {
              "type": "string",
              "knownValues": [
                "draft",
                "discussion",
                "voting",
                "passed",
                "failed",
                "withdrawn"
              ]
            },
            "createdAt": {
              "type": "string",
              "format": "datetime"
            }
          }
        }
      }
    }
  },
  {
    "lexicon": 1,
    "id": "network.coopsource.governance.vote",
    "defs": {
      "main": {
        "type": "record",
        "description": "A vote cast on a governance proposal.",
        "key": "tid",
        "record": {
          "type": "object",
          "required": [
            "proposalUri",
            "voterDid",
            "choice",
            "createdAt"
          ],
          "properties": {
            "proposalUri": {
              "type": "string",
              "format": "at-uri",
              "description": "The proposal being voted on."
            },
            "voterDid": {
              "type": "string",
              "format": "did",
              "description": "The DID of the voter."
            },
            "choice": {
              "type": "string",
              "description": "The vote choice. 'yes', 'no', 'abstain' for standard methods; JSON array for ranked_choice.",
              "maxLength": 1000
            },
            "weight": {
              "type": "number",
              "minimum": 0,
              "description": "Voting weight, defaults to 1.0. May be higher due to delegations."
            },
            "rationale": {
              "type": "string",
              "maxLength": 2000,
              "description": "Optional explanation of the voter's reasoning."
            },
            "delegatedFrom": {
              "type": "string",
              "format": "did",
              "description": "DID of the delegator, if this vote was cast on behalf of someone else."
            },
            "createdAt": {
              "type": "string",
              "format": "datetime"
            }
          }
        }
      }
    }
  },
  {
    "lexicon": 1,
    "id": "network.coopsource.org.cooperative",
    "defs": {
      "main": {
        "type": "record",
        "description": "A cooperative organization.",
        "key": "tid",
        "record": {
          "type": "object",
          "required": [
            "name",
            "status",
            "createdAt"
          ],
          "properties": {
            "name": {
              "type": "string",
              "maxLength": 255
            },
            "description": {
              "type": "string",
              "maxLength": 3000
            },
            "logoUrl": {
              "type": "string",
              "format": "uri",
              "maxLength": 2000
            },
            "website": {
              "type": "string",
              "format": "uri",
              "maxLength": 2000
            },
            "status": {
              "type": "string",
              "knownValues": [
                "active",
                "inactive",
                "dissolved"
              ]
            },
            "createdAt": {
              "type": "string",
              "format": "datetime"
            }
          }
        }
      }
    }
  },
  {
    "lexicon": 1,
    "id": "network.coopsource.org.memberApproval",
    "defs": {
      "main": {
        "type": "record",
        "description": "An approval record created by the cooperative in its PDS. Represents the cooperative's side of a bilateral membership. Role authority lives here, never in the membership record.",
        "key": "tid",
        "record": {
          "type": "object",
          "required": [
            "member",
            "createdAt"
          ],
          "properties": {
            "member": {
              "type": "string",
              "format": "did",
              "description": "The DID of the approved member entity (person or cooperative)."
            },
            "roles": {
              "type": "array",
              "items": {
                "type": "string"
              },
              "description": "Roles assigned by the cooperative to this member."
            },
            "createdAt": {
              "type": "string",
              "format": "datetime"
            }
          }
        }
      }
    }
  },
  {
    "lexicon": 1,
    "id": "network.coopsource.org.membership",
    "defs": {
      "main": {
        "type": "record",
        "description": "A membership record created by the member entity in their own PDS. Represents one side of a bilateral membership; the cooperative must also create a memberApproval record for the membership to become active.",
        "key": "tid",
        "record": {
          "type": "object",
          "required": [
            "cooperative",
            "createdAt"
          ],
          "properties": {
            "cooperative": {
              "type": "string",
              "format": "did",
              "description": "The DID of the cooperative being joined."
            },
            "createdAt": {
              "type": "string",
              "format": "datetime"
            }
          }
        }
      }
    }
  },
  {
    "lexicon": 1,
    "id": "network.coopsource.org.project",
    "defs": {
      "main": {
        "type": "record",
        "description": "A project, optionally linked to a cooperative.",
        "key": "tid",
        "record": {
          "type": "object",
          "required": [
            "name",
            "status",
            "visibility",
            "createdAt"
          ],
          "properties": {
            "name": {
              "type": "string",
              "maxLength": 255
            },
            "description": {
              "type": "string",
              "maxLength": 3000
            },
            "cooperativeUri": {
              "type": "string",
              "format": "at-uri",
              "description": "Parent cooperative, if any."
            },
            "status": {
              "type": "string",
              "knownValues": [
                "active",
                "completed",
                "on-hold",
                "cancelled"
              ]
            },
            "visibility": {
              "type": "string",
              "knownValues": [
                "public",
                "members",
                "private"
              ]
            },
            "createdAt": {
              "type": "string",
              "format": "datetime"
            }
          }
        }
      }
    }
  },
  {
    "lexicon": 1,
    "id": "network.coopsource.org.role",
    "defs": {
      "main": {
        "type": "record",
        "description": "A defined role within a cooperative or project, with responsibilities and permissions.",
        "key": "tid",
        "record": {
          "type": "object",
          "required": [
            "name",
            "entityUri",
            "createdAt"
          ],
          "properties": {
            "name": {
              "type": "string",
              "maxLength": 255,
              "description": "Role name, e.g. Coordinator, Treasurer."
            },
            "entityUri": {
              "type": "string",
              "format": "at-uri",
              "description": "The cooperative or project this role belongs to."
            },
            "description": {
              "type": "string",
              "maxLength": 3000
            },
            "responsibilities": {
              "type": "array",
              "items": {
                "type": "string",
                "maxLength": 1000
              }
            },
            "permissions": {
              "type": "array",
              "description": "What this role can do.",
              "items": {
                "type": "string",
                "maxLength": 500
              }
            },
            "termLengthMonths": {
              "type": "integer",
              "minimum": 0,
              "description": "Term length in months, if applicable."
            },
            "createdAt": {
              "type": "string",
              "format": "datetime"
            }
          }
        }
      }
    }
  },
  {
    "lexicon": 1,
    "id": "network.coopsource.org.team",
    "defs": {
      "main": {
        "type": "record",
        "description": "A team within a project.",
        "key": "tid",
        "record": {
          "type": "object",
          "required": [
            "name",
            "projectUri",
            "createdAt"
          ],
          "properties": {
            "name": {
              "type": "string",
              "maxLength": 255
            },
            "projectUri": {
              "type": "string",
              "format": "at-uri",
              "description": "The project this team belongs to."
            },
            "description": {
              "type": "string",
              "maxLength": 3000
            },
            "purpose": {
              "type": "string",
              "maxLength": 2000,
              "description": "Why this team exists."
            },
            "decisionMethod": {
              "type": "string",
              "knownValues": [
                "consensus",
                "voting",
                "lead-driven"
              ]
            },
            "createdAt": {
              "type": "string",
              "format": "datetime"
            }
          }
        }
      }
    }
  }
]
