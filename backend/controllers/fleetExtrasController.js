const Vehicle=require("../models/Vehicle");
const User=require("../models/User");
const DriverProfile=require("../models/DriverProfile");
const Trip=require("../models/Trip");
const Assignment=require("../models/Assignment");
const MaintenanceRecord=require("../models/MaintenanceRecord");
const MaintenanceWorkOrder=require("../models/MaintenanceWorkOrder");
const MaintenanceSchedule=require("../models/MaintenanceSchedule");
const FuelExpense=require("../models/FuelExpense");
const Expense=require("../models/Expense");
const TripExpense=require("../models/TripExpense");
const DriverExpense=require("../models/DriverExpense");
const TripTracking=require("../models/TripTracking");
const AuditLog=require("../models/AuditLog");
const TripRating=require("../models/TripRating");

const oid=id=>require("mongoose").Types.ObjectId.isValid(id);

const dateRange=(q,field)=>{
  const f={};
  if(q.from){
    const d=new Date(q.from);
    if(!Number.isNaN(d.getTime()))f[field]={$gte:d};
  }
  if(q.to){
    const d=new Date(q.to);
    if(!Number.isNaN(d.getTime())){
      d.setHours(23,59,59,999);
      f[field]={...(f[field]||{}),$lte:d};
    }
  }
  return f;
};

async function liveFleet(req,res){
  try{
    const vehicles=await Vehicle.find({})
      .select("registrationNumber vehicleNumber vehicleType status assignedDriver ownershipType")
      .populate("assignedDriver","fullName phone")
      .lean();

    const rows=await TripTracking.find({})
      .sort({recordedAt:-1})
      .limit(3000)
      .populate("trip","tripId tripStatus pickupLocation destination")
      .populate("vehicle","registrationNumber vehicleNumber vehicleType status")
      .populate("driver","fullName phone")
      .lean();

    const latest=new Map();

    for(const r of rows){
      const k=String(
        r.vehicle?._id ||
        r.vehicle ||
        r.trip?._id ||
        r.trip ||
        r._id
      );

      if(!latest.has(k))latest.set(k,r);
    }

    return res.json({
      success:true,
      vehicles:vehicles.map(v=>{
        const t=latest.get(String(v._id));

        return {
          ...v,
          tracking:t||null,
          location:t
            ? {
                latitude:t.latitude,
                longitude:t.longitude,
                currentLocation:t.currentLocation,
                speed:t.speed,
                recordedAt:t.recordedAt
              }
            : null
        };
      })
    });
  }catch(e){
    console.error(e);
    res.status(500).json({
      success:false,
      message:"Unable to load live fleet data."
    });
  }
}

async function vehicleHistory(req,res){
  try{
    if(!oid(req.params.id)){
      return res.status(400).json({
        success:false,
        message:"Invalid vehicle ID."
      });
    }

    const id=req.params.id;

    const [
      vehicle,
      trips,
      assignments,
      maintenance,
      workOrders,
      schedules,
      fuel,
      expenses,
      tripExpenses,
      driverExpenses,
      audits
    ]=await Promise.all([
      Vehicle.findById(id)
        .populate("ownerId","fullName email")
        .lean(),

      Trip.find({vehicle:id})
        .populate("driver","fullName")
        .populate("customer","fullName")
        .sort({scheduledStart:-1})
        .limit(200)
        .lean(),

      Assignment.find({vehicle:id})
        .populate("driver","fullName")
        .populate("assignedBy","fullName")
        .sort({assignedAt:-1})
        .limit(200)
        .lean(),

      MaintenanceRecord.find({vehicle:id})
        .sort({completionDate:-1,createdAt:-1})
        .limit(200)
        .lean(),

      MaintenanceWorkOrder.find({vehicle:id})
        .sort({createdAt:-1})
        .limit(200)
        .lean(),

      MaintenanceSchedule.find({vehicle:id})
        .sort({nextServiceDate:-1})
        .limit(100)
        .lean(),

      FuelExpense.find({vehicle:id})
        .populate("driver","fullName")
        .populate("trip","tripId")
        .sort({fuelDate:-1})
        .limit(200)
        .lean(),

      Expense.find({vehicle:id})
        .populate("driver","fullName")
        .populate("trip","tripId")
        .sort({expenseDate:-1})
        .limit(200)
        .lean(),

      TripExpense.find({vehicle:id})
        .populate("driver","fullName")
        .populate("trip","tripId")
        .sort({expenseDate:-1})
        .limit(200)
        .lean(),

      DriverExpense.find({vehicle:id})
        .populate("driver","fullName")
        .populate("trip","tripId")
        .sort({expenseDate:-1})
        .limit(200)
        .lean(),

      AuditLog.find({
        resource:"VEHICLE",
        recordId:id
      })
        .populate("actor","fullName role")
        .sort({createdAt:-1})
        .limit(200)
        .lean()
    ]);

    if(!vehicle){
      return res.status(404).json({
        success:false,
        message:"Vehicle not found."
      });
    }

    const events=[
      ...trips.map(x=>({
        date:x.updatedAt||x.createdAt,
        type:"TRIP",
        text:`Trip ${x.tripId} — ${x.tripStatus}`,
        trip:x
      })),

      ...assignments.map(x=>({
        date:x.assignedAt||x.createdAt,
        type:"ASSIGNMENT",
        text:`Driver ${x.driver?.fullName||"—"} assigned`,
        assignment:x
      })),

      ...maintenance.map(x=>({
        date:x.completionDate||x.createdAt,
        type:"MAINTENANCE",
        text:`${x.serviceType} completed`,
        maintenance:x
      })),

      ...workOrders.map(x=>({
        date:x.updatedAt||x.createdAt,
        type:"WORK_ORDER",
        text:`Maintenance work order ${x.status}`
      })),

      ...audits.map(x=>({
        date:x.createdAt,
        type:"AUDIT",
        text:`${x.action} by ${x.actor?.fullName||"System"}`
      }))
    ].sort((a,b)=>new Date(b.date)-new Date(a.date));

    return res.json({
      success:true,
      vehicle,
      trips,
      assignments,
      maintenance,
      workOrders,
      schedules,
      fuel,
      expenses,
      tripExpenses,
      driverExpenses,
      events
    });
  }catch(e){
    console.error(e);
    res.status(500).json({
      success:false,
      message:"Unable to load vehicle history."
    });
  }
}

async function driverPerformance(req,res){
  try{
    const drivers=await User.find({
      role:"DRIVER"
    })
      .select("fullName email isActive accountStatus")
      .lean();

    const ids=drivers.map(x=>x._id);

    const [
      stats,
      ratingStats,
      ratings,
      detailStats,
      positiveStats,
      issueStats,
      recommendationStats
    ]=await Promise.all([

      Trip.aggregate([
        {
          $match:{
            driver:{$in:ids}
          }
        },
        {
          $group:{
            _id:"$driver",
            total:{$sum:1},
            completed:{
              $sum:{
                $cond:[
                  {$eq:["$tripStatus","COMPLETED"]},
                  1,
                  0
                ]
              }
            },
            cancelled:{
              $sum:{
                $cond:[
                  {$eq:["$tripStatus","CANCELLED"]},
                  1,
                  0
                ]
              }
            },
            delayed:{
              $sum:{
                $cond:[
                  {
                    $and:[
                      {$ne:["$tripStatus","COMPLETED"]},
                      {
                        $regexMatch:{
                          input:{$ifNull:["$notes",""]},
                          regex:"delay",
                          options:"i"
                        }
                      }
                    ]
                  },
                  1,
                  0
                ]
              }
            }
          }
        }
      ]),

      TripRating.aggregate([
        {
          $match:{
            driver:{$in:ids}
          }
        },
        {
          $group:{
            _id:"$driver",
            driverAverage:{$avg:"$driverRating"},
            serviceAverage:{$avg:"$serviceRating"},
            ratingCount:{$sum:1},
            ratings5:{
              $sum:{
                $cond:[
                  {$eq:["$driverRating",5]},
                  1,
                  0
                ]
              }
            },
            ratings4:{
              $sum:{
                $cond:[
                  {$eq:["$driverRating",4]},
                  1,
                  0
                ]
              }
            },
            ratings3:{
              $sum:{
                $cond:[
                  {$eq:["$driverRating",3]},
                  1,
                  0
                ]
              }
            },
            ratings2:{
              $sum:{
                $cond:[
                  {$eq:["$driverRating",2]},
                  1,
                  0
                ]
              }
            },
            ratings1:{
              $sum:{
                $cond:[
                  {$eq:["$driverRating",1]},
                  1,
                  0
                ]
              }
            }
          }
        }
      ]),

      TripRating.find({
        driver:{$in:ids}
      })
        .sort({createdAt:-1})
        .limit(200)
        .populate("customer","fullName email")
        .populate("trip","tripId pickupLocation destination")
        .lean(),

      TripRating.aggregate([
        {
          $match:{
            driver:{$in:ids}
          }
        },
        {
          $group:{
            _id:"$driver",
            safety:{$avg:"$driverDetails.safety"},
            professionalism:{$avg:"$driverDetails.professionalism"},
            communication:{$avg:"$driverDetails.communication"},
            driverPunctuality:{$avg:"$driverDetails.punctuality"},
            pickup:{$avg:"$serviceDetails.pickup"},
            tripExperience:{$avg:"$serviceDetails.tripExperience"},
            servicePunctuality:{$avg:"$serviceDetails.punctuality"},
            vehicleCondition:{$avg:"$serviceDetails.vehicleCondition"}
          }
        }
      ]),

      TripRating.aggregate([
        {
          $match:{
            driver:{$in:ids}
          }
        },
        {
          $unwind:"$positiveTags"
        },
        {
          $group:{
            _id:{
              driver:"$driver",
              tag:"$positiveTags"
            },
            count:{$sum:1}
          }
        },
        {
          $sort:{
            count:-1
          }
        }
      ]),

      TripRating.aggregate([
        {
          $match:{
            driver:{$in:ids}
          }
        },
        {
          $unwind:"$issueTags"
        },
        {
          $group:{
            _id:{
              driver:"$driver",
              tag:"$issueTags"
            },
            count:{$sum:1}
          }
        },
        {
          $sort:{
            count:-1
          }
        }
      ]),

      TripRating.aggregate([
        {
          $match:{
            driver:{$in:ids}
          }
        },
        {
          $group:{
            _id:{
              driver:"$driver",
              recommendation:"$recommendation"
            },
            count:{$sum:1}
          }
        }
      ])
    ]);

    const map=new Map(
      stats.map(x=>[String(x._id),x])
    );

    const ratingMap=new Map(
      ratingStats.map(x=>[String(x._id),x])
    );

    // FIX:
    // detailStats is the variable returned from Promise.all above.
    // The previous code incorrectly referenced driverDetailStats here.
    const driverDetailMap=new Map(
      detailStats.map(x=>[String(x._id),x])
    );

    const detailMap=new Map(
      detailStats.map(x=>[String(x._id),x])
    );

    const positiveMap=new Map();

    for(const x of positiveStats){
      const key=String(x._id.driver);
      const list=positiveMap.get(key)||[];

      if(list.length<5){
        list.push({
          tag:x._id.tag,
          count:x.count
        });
      }

      positiveMap.set(key,list);
    }

    const recommendationMap=new Map();

    for(const x of recommendationStats){
      const key=String(x._id.driver);
      const map=recommendationMap.get(key)||{};

      map[x._id.recommendation||"Unanswered"]=
        Number(x.count||0);

      recommendationMap.set(key,map);
    }

    const issueMap=new Map();

    for(const x of issueStats){
      const key=String(x._id.driver);
      const list=issueMap.get(key)||[];

      if(list.length<6){
        list.push({
          tag:x._id.tag,
          count:x.count
        });
      }

      issueMap.set(key,list);
    }

    const recentMap=new Map();

    for(const rating of ratings){
      const key=String(rating.driver);
      const list=recentMap.get(key)||[];

      if(list.length<5){
        list.push(rating);
      }

      recentMap.set(key,list);
    }

    return res.json({
      success:true,
      drivers:drivers.map(d=>{
        const x=map.get(String(d._id))||{};
        const r=ratingMap.get(String(d._id))||{};

        const total=Number(x.total||0);
        const ratingCount=Number(r.ratingCount||0);

        return {
          ...d,

          totalTrips:total,

          completedTrips:
            Number(x.completed||0),

          cancelledTrips:
            Number(x.cancelled||0),

          delayedTrips:
            Number(x.delayed||0),

          completionRate:
            total
              ? x.completed/total*100
              : 0,

          cancellationRate:
            total
              ? x.cancelled/total*100
              : 0,

          delayRate:
            total
              ? x.delayed/total*100
              : 0,

          ratingCount,

          driverRatingAverage:
            ratingCount
              ? Number(
                  Number(r.driverAverage||0)
                    .toFixed(2)
                )
              : null,

          serviceRatingAverage:
            ratingCount
              ? Number(
                  Number(r.serviceAverage||0)
                    .toFixed(2)
                )
              : null,

          ratingDistribution:{
            5:Number(r.ratings5||0),
            4:Number(r.ratings4||0),
            3:Number(r.ratings3||0),
            2:Number(r.ratings2||0),
            1:Number(r.ratings1||0)
          },

          ratingDetails:(()=>{
            const d2=
              detailMap.get(String(d._id))||{};

            const av=v=>
              v==null
                ? null
                : Number(
                    Number(v).toFixed(2)
                  );

            return {
              safety:av(d2.safety),
              professionalism:
                av(d2.professionalism),
              communication:
                av(d2.communication),
              driverPunctuality:
                av(d2.driverPunctuality),
              pickup:
                av(d2.pickup),
              tripExperience:
                av(d2.tripExperience),
              servicePunctuality:
                av(d2.servicePunctuality),
              vehicleCondition:
                av(d2.vehicleCondition)
            };
          })(),

          positiveTags:
            positiveMap.get(String(d._id))||[],

          lowRatingCount:
            Number(
              (r.ratings1||0)+
              (r.ratings2||0)
            ),

          issueTags:
            issueMap.get(String(d._id))||[],

          recommendationStats:
            recommendationMap.get(String(d._id))||{},

          recentRatings:
            recentMap.get(String(d._id))||[]
        };
      })
    });

  }catch(e){
    console.error(e);

    res.status(500).json({
      success:false,
      message:"Unable to load driver performance."
    });
  }
}

async function customerRatings(req,res){
  try{
    const drivers=await User.find({
      role:"DRIVER"
    })
      .select("fullName email isActive accountStatus")
      .lean();

    const ids=drivers.map(x=>x._id);

    const match={
      driver:{$in:ids}
    };

    const [
      ratingStats,
      driverDetailStats,
      overallDetails,
      driverPositiveStats,
      driverIssueStats,
      driverRecommendationStats,
      driverDistribution,
      serviceDistribution,
      recentRatings,
      trends
    ]=await Promise.all([

      TripRating.aggregate([
        {
          $match:match
        },
        {
          $group:{
            _id:"$driver",
            driverAverage:{$avg:"$driverRating"},
            serviceAverage:{$avg:"$serviceRating"},
            ratingCount:{$sum:1},

            fiveStar:{
              $sum:{
                $cond:[
                  {
                    $and:[
                      {$eq:["$driverRating",5]},
                      {$eq:["$serviceRating",5]}
                    ]
                  },
                  1,
                  0
                ]
              }
            },

            lowRatingCount:{
              $sum:{
                $cond:[
                  {
                    $or:[
                      {$lte:["$driverRating",2]},
                      {$lte:["$serviceRating",2]}
                    ]
                  },
                  1,
                  0
                ]
              }
            }
          }
        }
      ]),

      TripRating.aggregate([
        {
          $match:match
        },
        {
          $group:{
            _id:"$driver",
            safety:{$avg:"$driverDetails.safety"},
            professionalism:{
              $avg:"$driverDetails.professionalism"
            },
            communication:{
              $avg:"$driverDetails.communication"
            },
            driverPunctuality:{
              $avg:"$driverDetails.punctuality"
            },
            pickup:{
              $avg:"$serviceDetails.pickup"
            },
            tripExperience:{
              $avg:"$serviceDetails.tripExperience"
            },
            servicePunctuality:{
              $avg:"$serviceDetails.punctuality"
            },
            vehicleCondition:{
              $avg:"$serviceDetails.vehicleCondition"
            }
          }
        }
      ]),

      TripRating.aggregate([
        {
          $match:match
        },
        {
          $group:{
            _id:null,
            safety:{$avg:"$driverDetails.safety"},
            professionalism:{
              $avg:"$driverDetails.professionalism"
            },
            communication:{
              $avg:"$driverDetails.communication"
            },
            driverPunctuality:{
              $avg:"$driverDetails.punctuality"
            },
            pickup:{
              $avg:"$serviceDetails.pickup"
            },
            tripExperience:{
              $avg:"$serviceDetails.tripExperience"
            },
            servicePunctuality:{
              $avg:"$serviceDetails.punctuality"
            },
            vehicleCondition:{
              $avg:"$serviceDetails.vehicleCondition"
            }
          }
        }
      ]),

      TripRating.aggregate([
        {
          $match:match
        },
        {
          $unwind:"$positiveTags"
        },
        {
          $group:{
            _id:{
              driver:"$driver",
              tag:"$positiveTags"
            },
            count:{$sum:1}
          }
        },
        {
          $sort:{
            count:-1
          }
        }
      ]),

      TripRating.aggregate([
        {
          $match:match
        },
        {
          $unwind:"$issueTags"
        },
        {
          $group:{
            _id:{
              driver:"$driver",
              tag:"$issueTags"
            },
            count:{$sum:1}
          }
        },
        {
          $sort:{
            count:-1
          }
        }
      ]),

      TripRating.aggregate([
        {
          $match:match
        },
        {
          $group:{
            _id:{
              driver:"$driver",
              recommendation:"$recommendation"
            },
            count:{$sum:1}
          }
        }
      ]),

      TripRating.aggregate([
        {
          $match:match
        },
        {
          $group:{
            _id:"$driverRating",
            count:{$sum:1}
          }
        },
        {
          $sort:{
            _id:-1
          }
        }
      ]),

      TripRating.aggregate([
        {
          $match:match
        },
        {
          $group:{
            _id:"$serviceRating",
            count:{$sum:1}
          }
        },
        {
          $sort:{
            _id:-1
          }
        }
      ]),

      TripRating.find(match)
        .sort({createdAt:-1})
        .limit(300)
        .populate("customer","fullName email")
        .populate("driver","fullName email")
        .populate(
          "trip",
          "tripId pickupLocation destination"
        )
        .lean(),

      TripRating.aggregate([
        {
          $match:match
        },
        {
          $group:{
            _id:{
              $dateToString:{
                format:"%Y-%m",
                date:"$createdAt"
              }
            },
            driverAverage:{
              $avg:"$driverRating"
            },
            serviceAverage:{
              $avg:"$serviceRating"
            },
            ratings:{
              $sum:1
            }
          }
        },
        {
          $sort:{
            _id:1
          }
        },
        {
          $limit:24
        }
      ])
    ]);

    const ratingMap=new Map(
      ratingStats.map(x=>[
        String(x._id),
        x
      ])
    );

    const driverDetailMap=new Map(
      driverDetailStats.map(x=>[
        String(x._id),
        x
      ])
    );

    const positiveMap=new Map();
    const issueMap=new Map();
    const recommendationMap=new Map();

    for(const x of driverPositiveStats){
      const key=String(x._id.driver);
      const list=
        positiveMap.get(key)||[];

      if(list.length<8){
        list.push({
          tag:x._id.tag,
          count:Number(x.count||0)
        });
      }

      positiveMap.set(key,list);
    }

    for(const x of driverIssueStats){
      const key=String(x._id.driver);
      const list=
        issueMap.get(key)||[];

      if(list.length<8){
        list.push({
          tag:x._id.tag,
          count:Number(x.count||0)
        });
      }

      issueMap.set(key,list);
    }

    for(const x of driverRecommendationStats){
      const key=String(x._id.driver);
      const stats=
        recommendationMap.get(key)||{};

      stats[
        x._id.recommendation||
        "Unanswered"
      ]=Number(x.count||0);

      recommendationMap.set(
        key,
        stats
      );
    }

    const recentMap=new Map();

    for(const r of recentRatings){
      const key=String(
        r.driver?._id||
        r.driver
      );

      const list=
        recentMap.get(key)||[];

      if(list.length<5){
        list.push(r);
      }

      recentMap.set(key,list);
    }

    const avg=v=>
      v==null
        ? null
        : Number(
            Number(v).toFixed(2)
          );

    const detail=
      overallDetails[0]||{};

    const driverDetails={
      safety:avg(detail.safety),
      professionalism:
        avg(detail.professionalism),
      communication:
        avg(detail.communication),
      punctuality:
        avg(detail.driverPunctuality)
    };

    const serviceDetails={
      pickup:avg(detail.pickup),
      tripExperience:
        avg(detail.tripExperience),
      punctuality:
        avg(detail.servicePunctuality),
      vehicleCondition:
        avg(detail.vehicleCondition)
    };

    const directory=drivers.map(d=>{
      const r=
        ratingMap.get(String(d._id))||{};

      const dt=
        driverDetailMap.get(
          String(d._id)
        )||{};

      const ratingCount=
        Number(r.ratingCount||0);

      const driverAverage=
        ratingCount
          ? avg(r.driverAverage)
          : null;

      const serviceAverage=
        ratingCount
          ? avg(r.serviceAverage)
          : null;

      const overallAverage=
        ratingCount
          ? avg(
              (
                Number(r.driverAverage||0)+
                Number(r.serviceAverage||0)
              )/2
            )
          : null;

      const issues=
        issueMap.get(String(d._id))||[];

      const positiveTags=
        positiveMap.get(String(d._id))||[];

      const recommendationStats=
        recommendationMap.get(
          String(d._id)
        )||{};

      const dist={
        5:Number(r.ratings5||0),
        4:Number(r.ratings4||0),
        3:Number(r.ratings3||0),
        2:Number(r.ratings2||0),
        1:Number(r.ratings1||0)
      };

      let attentionSeverity=null;
      const attentionReasons=[];

      const unsafe=
        issues.find(
          x=>x.tag==="Unsafe driving"
        );

      if(
        driverAverage!=null &&
        driverAverage<=2.5
      ){
        attentionSeverity="Critical";
        attentionReasons.push(
          "Driver rating is 2.5 or below."
        );
      }

      if(
        serviceAverage!=null &&
        serviceAverage<=2.5
      ){
        attentionSeverity="Critical";
        attentionReasons.push(
          "Trip service rating is 2.5 or below."
        );
      }

      if(
        Number(unsafe?.count||0)>=2
      ){
        attentionSeverity="Critical";
        attentionReasons.push(
          "Repeated unsafe-driving feedback."
        );
      }

      if(
        !attentionSeverity &&
        (
          (
            driverAverage!=null &&
            driverAverage<=3
          ) ||
          (
            serviceAverage!=null &&
            serviceAverage<=3
          ) ||
          Number(r.lowRatingCount||0)>=2
        )
      ){
        attentionSeverity="Warning";

        if(
          driverAverage!=null &&
          driverAverage<=3
        ){
          attentionReasons.push(
            "Driver rating is at or below 3.0."
          );
        }

        if(
          serviceAverage!=null &&
          serviceAverage<=3
        ){
          attentionReasons.push(
            "Service rating is at or below 3.0."
          );
        }

        if(
          Number(r.lowRatingCount||0)>=2
        ){
          attentionReasons.push(
            `${Number(r.lowRatingCount)} low ratings recorded.`
          );
        }
      }

      if(
        !attentionSeverity &&
        issues.some(x=>x.count>=2)
      ){
        attentionSeverity="Monitor";
        attentionReasons.push(
          "Repeated improvement feedback detected."
        );
      }

      return {
        ...d,

        ratingCount,

        driverRatingAverage:
          driverAverage,

        serviceRatingAverage:
          serviceAverage,

        overallRating:
          overallAverage,

        lowRatingCount:
          Number(r.lowRatingCount||0),

        ratingDetails:{
          safety:avg(dt.safety),
          professionalism:
            avg(dt.professionalism),
          communication:
            avg(dt.communication),
          driverPunctuality:
            avg(dt.driverPunctuality),
          pickup:
            avg(dt.pickup),
          tripExperience:
            avg(dt.tripExperience),
          servicePunctuality:
            avg(dt.servicePunctuality),
          vehicleCondition:
            avg(dt.vehicleCondition)
        },

        positiveTags,

        issueTags:issues,

        recommendationStats,

        recentRatings:
          recentMap.get(
            String(d._id)
          )||[],

        ratingDistribution:
          dist,

        attentionSeverity,

        attentionReasons
      };
    });

    const ranked=directory
      .filter(d=>d.ratingCount>=5)
      .sort(
        (a,b)=>
          Number(b.overallRating||0)-
          Number(a.overallRating||0)||
          Number(b.driverRatingAverage||0)-
          Number(a.driverRatingAverage||0)||
          b.ratingCount-a.ratingCount
      )
      .map(
        (d,i)=>({
          ...d,
          rank:i+1
        })
      );

    const attentionOrder={
      Critical:0,
      Warning:1,
      Monitor:2
    };

    const attention=directory
      .filter(d=>d.attentionSeverity)
      .sort(
        (a,b)=>
          attentionOrder[a.attentionSeverity]-
          attentionOrder[b.attentionSeverity]||
          Number(a.overallRating||99)-
          Number(b.overallRating||99)||
          b.ratingCount-a.ratingCount
      )
      .slice(0,20);

    const totalRatings=
      ratingStats.reduce(
        (sum,x)=>
          sum+
          Number(x.ratingCount||0),
        0
      );

    const driverAverage=
      totalRatings
        ? ratingStats.reduce(
            (sum,x)=>
              sum+
              Number(x.driverAverage||0)*
              Number(x.ratingCount||0),
            0
          )/totalRatings
        : 0;

    const serviceAverage=
      totalRatings
        ? ratingStats.reduce(
            (sum,x)=>
              sum+
              Number(x.serviceAverage||0)*
              Number(x.ratingCount||0),
            0
          )/totalRatings
        : 0;

    const overallAverage=
      (driverAverage+
       serviceAverage)/2;

    const fiveStarCount=
      ratingStats.reduce(
        (sum,x)=>
          sum+
          Number(x.fiveStar||0),
        0
      );

    const lowCount=
      ratingStats.reduce(
        (sum,x)=>
          sum+
          Number(x.lowRatingCount||0),
        0
      );

    const recommendationStats={};

    for(
      const x of driverRecommendationStats
    ){
      const key=
        x._id.recommendation||
        "Unanswered";

      recommendationStats[key]=
        (
          recommendationStats[key]||
          0
        )+
        Number(x.count||0);
    }

    const recommendationAnswered=
      Object.entries(
        recommendationStats
      )
      .filter(
        ([k])=>k!=="Unanswered"
      )
      .reduce(
        (s,[,v])=>s+v,
        0
      );

    const recommendationPositive=
      Number(
        recommendationStats.Definitely||0
      )+
      Number(
        recommendationStats.Probably||0
      );

    const mapDist=arr=>
      arr.reduce(
        (m,x)=>{
          m[x._id]=
            Number(x.count||0);
          return m;
        },
        {}
      );

    const positiveTags={};

    for(
      const x of driverPositiveStats
    ){
      positiveTags[x._id.tag]=
        (
          positiveTags[x._id.tag]||
          0
        )+
        Number(x.count||0);
    }

    const issueTags={};

    for(
      const x of driverIssueStats
    ){
      issueTags[x._id.tag]=
        (
          issueTags[x._id.tag]||
          0
        )+
        Number(x.count||0);
    }

    return res.json({
      success:true,

      summary:{
        totalRatings,

        driverAverage:
          Number(
            driverAverage.toFixed(2)
          ),

        serviceAverage:
          Number(
            serviceAverage.toFixed(2)
          ),

        overallAverage:
          Number(
            overallAverage.toFixed(2)
          ),

        ratedDrivers:
          directory.filter(
            d=>d.ratingCount>0
          ).length,

        rankedDrivers:
          ranked.length,

        unrankedDrivers:
          directory.filter(
            d=>
              d.ratingCount>0 &&
              d.ratingCount<5
          ).length,

        fiveStarRate:
          totalRatings
            ? Number(
                (
                  fiveStarCount/
                  totalRatings*
                  100
                ).toFixed(1)
              )
            : 0,

        lowRatingCount:
          lowCount,

        recommendationPositiveRate:
          recommendationAnswered
            ? Number(
                (
                  recommendationPositive/
                  recommendationAnswered*
                  100
                ).toFixed(1)
              )
            : 0,

        recommendationAnswered
      },

      driverDistribution:
        mapDist(driverDistribution),

      serviceDistribution:
        mapDist(serviceDistribution),

      driverDetails,

      serviceDetails,

      positiveTags,

      issueTags,

      recommendationStats,

      trends:
        trends
          .slice(-6)
          .map(x=>({
            month:x._id,
            driverAverage:
              Number(
                Number(
                  x.driverAverage||0
                ).toFixed(2)
              ),
            serviceAverage:
              Number(
                Number(
                  x.serviceAverage||0
                ).toFixed(2)
              ),
            ratings:
              Number(x.ratings||0)
          })),

      driverRankings:
        ranked,

      recentReviews:
        recentRatings.slice(0,12),

      needsAttention:
        attention
    });

  }catch(e){
    console.error(e);

    res.status(500).json({
      success:false,
      message:"Unable to load customer rating analytics."
    });
  }
}

module.exports={
  liveFleet,
  vehicleHistory,
  driverPerformance,
  customerRatings
};