import sys
import json
from ortools.constraint_solver import routing_enums_pb2
from ortools.constraint_solver import pywrapcp


def main():
    # Read JSON input from stdin
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"Invalid JSON input: {str(e)}"}))
        sys.exit(1)

    durations = data.get('durations')
    time_windows_input = data.get('time_windows', [])
    service_times = data.get('service_times', [])
    time_limit_s = int(data.get('time_limit_s', 5))

    if not durations or not isinstance(durations, list) or len(durations) == 0:
        print(json.dumps({"error": "Missing or invalid durations matrix"}))
        sys.exit(1)

    num_locations = len(durations)

    # Pad time windows and service times if needed (depot + customers)
    time_windows = time_windows_input if time_windows_input else [[0, 86400]] * num_locations
    if len(time_windows) < num_locations:
        time_windows += [[0, 86400]] * (num_locations - len(time_windows))

    if len(service_times) < num_locations:
        service_times += [0] * (num_locations - len(service_times))

    # Routing setup
    manager = pywrapcp.RoutingIndexManager(num_locations, 1, 0)  # 1 vehicle, depot=0
    routing = pywrapcp.RoutingModel(manager)

    # Duration callback: travel + service time at departure node
    def duration_callback(from_index, to_index):
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)
        travel = durations[from_node][to_node]
        service = service_times[from_node]
        return travel + service

    transit_index = routing.RegisterTransitCallback(duration_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_index)

    # Time dimension
    horizon = 86400
    max_slack = 7200  # Allow waiting up to 2 hours

    time_dimension = routing.AddDimension(
        transit_index,
        max_slack,
        horizon,
        False,
        'Time'
    )
    time_dimension = routing.GetDimensionOrDie('Time')

    # Hard time windows on cumul var (arrival time)
    for loc_idx in range(num_locations):
        index = manager.NodeToIndex(loc_idx)
        start_sec, end_sec = time_windows[loc_idx]
        cumul_var = time_dimension.CumulVar(index)
        cumul_var.SetMin(start_sec)
        cumul_var.SetMax(end_sec)

    # Search params
    search_parameters = pywrapcp.DefaultRoutingSearchParameters()
    search_parameters.time_limit.seconds = time_limit_s
    search_parameters.first_solution_strategy = (
        routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    )

    # Solve
    solution = routing.SolveWithParameters(search_parameters)

    if not solution:
        print(json.dumps({
            "error": "No solution found within time limit",
            "solver_time_ms": time_limit_s * 1000  # fallback
        }))
        sys.exit(0)

    # Extract route
    index = routing.Start(0)
    sequence = []
    arrival_times = []
    total_duration = 0

    while not routing.IsEnd(index):
        node = manager.IndexToNode(index)
        sequence.append(node)
        arrival_times.append(solution.Value(time_dimension.CumulVar(index)))
        prev = index
        index = solution.Value(routing.NextVar(index))
        if not routing.IsEnd(index):
            total_duration += routing.GetArcCostForVehicle(prev, index, 0)

    sequence.append(manager.IndexToNode(index))
    arrival_times.append(solution.Value(time_dimension.CumulVar(index)))

    # Debug to stderr
    print(f"DEBUG FULL PATH: {' → '.join(map(str, sequence))}", file=sys.stderr)
    print(f"DEBUG ARRIVALS: {arrival_times}", file=sys.stderr)

    # Output
    print(json.dumps({
        "sequence": sequence[1:-1],  # customers only
        "arrival_times": arrival_times[1:-1],
        "total_duration_s": total_duration,
        "solver_time_ms": routing.solver().WallTime(),  
        "status": routing.status()
    }))


if __name__ == "__main__":
    main()